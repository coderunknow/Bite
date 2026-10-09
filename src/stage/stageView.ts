/**
 * The 3D stage (three.js). Renders the live scene state and handles editor interaction.
 *
 * - Editor camera (OrbitControls) is independent of the scene. Navigating never changes object data.
 * - Stage view uses the stage camera object's pose (or a fixed default camera when none is set).
 * - Object meshes mirror the live state; the project supplies structure (kinds, names, hierarchy).
 * - Selection by click (raycast). Transform gizmo edits write back through `onTransform`.
 * - Rendering is on demand: the host calls `requestRender()` after changes; the loop idles otherwise.
 * - Integrated-GPU friendly: pixel ratio capped at 1.5, one shadow-casting light, no post-processing.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import type { Project, SceneObject } from '../core/project';
import type { ObjectKind, Vec3 } from '../core/types';
import type { SceneState } from '../runtime/sceneState';
import { DEG_TO_RAD, RAD_TO_DEG } from '../core/math';

export type TransformMode = 'translate' | 'rotate' | 'scale';
export type ViewMode = 'edit' | 'stage';

export interface StageCallbacks {
  onSelect(objectId: string | null): void;
  onTransform(objectId: string, patch: { position: Vec3; rotation: Vec3; scale: Vec3 }): void;
}

interface ObjectNode {
  kind: ObjectKind;
  root: THREE.Object3D;
  mesh: THREE.Mesh | null;
  light: THREE.PointLight | null;
  material: THREE.MeshStandardMaterial | null;
}

const PHYSICAL_MESH_KINDS: ReadonlySet<ObjectKind> = new Set<ObjectKind>(['cube', 'sphere', 'cylinder', 'plane', 'model']);

function geometryFor(kind: ObjectKind): THREE.BufferGeometry {
  switch (kind) {
    case 'sphere':
      return new THREE.SphereGeometry(0.5, 32, 16);
    case 'cylinder':
      return new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
    case 'plane': {
      const g = new THREE.PlaneGeometry(1, 1);
      g.rotateX(-Math.PI / 2);
      return g;
    }
    case 'camera':
    case 'light':
    case 'group':
      return new THREE.BoxGeometry(0.25, 0.25, 0.25);
    default:
      return new THREE.BoxGeometry(1, 1, 1);
  }
}

/** True when the object and all of its ancestors are visible (hidden groups hide their children). */
function isShown(object: THREE.Object3D): boolean {
  for (let o: THREE.Object3D | null = object; o; o = o.parent) {
    if (!o.visible) return false;
  }
  return true;
}

export class StageView {
  readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly editorCamera: THREE.PerspectiveCamera;
  private readonly stageCamera: THREE.PerspectiveCamera;
  private readonly orbit: OrbitControls;
  private readonly transform: TransformControls;
  private readonly gizmo: THREE.Object3D;
  private readonly nodes = new Map<string, ObjectNode>();
  private readonly pickable: THREE.Object3D[] = [];
  private readonly selectionBox: THREE.BoxHelper;
  private readonly grid: THREE.GridHelper;
  private readonly ambient: THREE.HemisphereLight;
  private readonly sun: THREE.DirectionalLight;
  private viewMode: ViewMode = 'edit';
  private selectedId: string | null = null;
  private stageCameraId: string | null = null;
  private needsRender = true;
  private frameHandle = 0;
  private disposed = false;
  private readonly resizeObserver: ResizeObserver;
  private pointerDownAt: { x: number; y: number } | null = null;
  private readonly raycaster = new THREE.Raycaster();
  private readonly canvasEl: HTMLCanvasElement;
  private editable = true;
  private gridRequested = true;
  /** When true, a frame is rendered every animation frame (used while the program runs). */
  private continuous = false;
  private readonly onPointerDown = (event: PointerEvent) => {
    this.pointerDownAt = { x: event.clientX, y: event.clientY };
  };
  private readonly onPointerUp = (event: PointerEvent) => {
    const start = this.pointerDownAt;
    this.pointerDownAt = null;
    if (!start || this.transform.dragging) return;
    // A click is a press and release without much movement; larger movement is an orbit drag.
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4) return;
    this.pick(event);
  };
  private readonly onObjectChange = () => {
    const id = this.selectedId;
    if (!id) return;
    const node = this.nodes.get(id);
    if (!node) return;
    const r = node.root;
    this.callbacks.onTransform(id, {
      position: [r.position.x, r.position.y, r.position.z],
      rotation: [r.rotation.x * RAD_TO_DEG, r.rotation.y * RAD_TO_DEG, r.rotation.z * RAD_TO_DEG],
      scale: [r.scale.x, r.scale.y, r.scale.z],
    });
  };

  constructor(
    private readonly container: HTMLElement,
    private readonly callbacks: StageCallbacks,
  ) {
    this.canvasEl = document.createElement('canvas');
    this.canvasEl.className = 'stage-canvas';
    this.canvasEl.dataset.testid = 'stage-canvas';
    container.appendChild(this.canvasEl);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvasEl, antialias: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setClearColor('#e7eef8', 1);

    this.editorCamera = new THREE.PerspectiveCamera(50, 1, 0.05, 500);
    this.editorCamera.position.set(6, 5, 9);
    this.stageCamera = new THREE.PerspectiveCamera(60, 1, 0.05, 500);
    this.stageCamera.position.set(0, 4, 11);
    this.stageCamera.lookAt(0, 1, 0);

    this.ambient = new THREE.HemisphereLight('#ffffff', '#8c8c9c', 1.1);
    this.scene.add(this.ambient);
    this.sun = new THREE.DirectionalLight('#ffffff', 2.2);
    this.sun.position.set(6, 12, 8);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.left = -15;
    this.sun.shadow.camera.right = 15;
    this.sun.shadow.camera.top = 15;
    this.sun.shadow.camera.bottom = -15;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 60;
    this.scene.add(this.sun);

    this.grid = new THREE.GridHelper(40, 40, '#9fb3c8', '#c9d6e3');
    this.grid.position.y = 0.001;
    this.scene.add(this.grid);

    this.selectionBox = new THREE.BoxHelper(new THREE.Object3D(), '#ffab19');
    this.selectionBox.visible = false;
    this.scene.add(this.selectionBox);

    this.orbit = new OrbitControls(this.editorCamera, this.canvasEl);
    this.orbit.target.set(0, 1, 0);
    this.orbit.enableDamping = true;
    this.orbit.addEventListener('change', () => this.requestRender());

    this.transform = new TransformControls(this.editorCamera, this.canvasEl);
    this.transform.setSpace('local');
    this.transform.addEventListener('dragging-changed', (event: { value: unknown }) => {
      this.orbit.enabled = !event.value;
    });
    this.transform.addEventListener('objectChange', this.onObjectChange);
    this.gizmo = this.transform.getHelper();
    this.scene.add(this.gizmo);

    this.canvasEl.addEventListener('pointerdown', this.onPointerDown);
    this.canvasEl.addEventListener('pointerup', this.onPointerUp);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.loop();
  }

  /** Sets whether the user may drag the gizmo and pick objects (false while the program runs). */
  setEditable(enabled: boolean): void {
    this.editable = enabled;
    this.transform.enabled = enabled;
    this.gizmo.visible = enabled && this.selectedId !== null;
    this.requestRender();
  }

  setViewMode(mode: ViewMode): void {
    this.viewMode = mode;
    this.grid.visible = mode === 'edit' && this.gridRequested;
    this.requestRender();
  }

  setGridVisible(visible: boolean): void {
    this.gridRequested = visible;
    this.grid.visible = visible && this.viewMode === 'edit';
    this.requestRender();
  }

  setBackground(color: string): void {
    this.renderer.setClearColor(color, 1);
    this.requestRender();
  }

  setTransformMode(mode: TransformMode): void {
    this.transform.setMode(mode);
    this.requestRender();
  }

  setSelected(objectId: string | null): void {
    this.selectedId = objectId;
    const node = objectId ? this.nodes.get(objectId) : undefined;
    if (node && this.editable) {
      this.transform.attach(node.root);
      this.gizmo.visible = true;
      this.selectionBox.setFromObject(node.root);
      this.selectionBox.visible = true;
    } else {
      this.transform.detach();
      this.gizmo.visible = false;
      this.selectionBox.visible = false;
    }
    this.requestRender();
  }

  /** Mirrors the project's structure and the live pose into three.js objects. Removes stale objects. */
  sync(project: Project, scene: SceneState): void {
    const liveIds = new Set<string>();
    for (const obj of project.objects) {
      liveIds.add(obj.id);
      this.ensureNode(obj);
    }
    for (const [id, node] of this.nodes) {
      if (!liveIds.has(id)) this.removeNode(id, node);
    }
    this.stageCameraId = project.settings.stageCameraId;
    for (const obj of project.objects) {
      const node = this.nodes.get(obj.id)!;
      const live = scene.get(obj.id);
      const parent = obj.parentId ? this.nodes.get(obj.parentId)?.root : undefined;
      const wantedParent = parent ?? this.scene;
      if (node.root.parent !== wantedParent) wantedParent.add(node.root);
      if (!live) continue;
      node.root.position.set(live.position[0], live.position[1], live.position[2]);
      node.root.rotation.set(live.rotation[0] * DEG_TO_RAD, live.rotation[1] * DEG_TO_RAD, live.rotation[2] * DEG_TO_RAD, 'YXZ');
      node.root.scale.set(live.scale[0], live.scale[1], live.scale[2]);
      node.root.visible = live.visible;
      if (node.material) {
        node.material.color.set(live.color);
        node.material.opacity = live.opacity;
        node.material.transparent = live.opacity < 1;
        node.material.depthWrite = live.opacity >= 1;
        node.material.roughness = obj.material.roughness;
        node.material.metalness = obj.material.metalness;
      }
      if (node.light && obj.light) {
        node.light.color.set(obj.light.color);
        node.light.intensity = obj.light.intensity / 10;
      }
    }
    if (this.selectedId && !liveIds.has(this.selectedId)) this.setSelected(null);
    else if (this.selectedId) this.setSelected(this.selectedId);
    this.requestRender();
  }

  private ensureNode(obj: SceneObject): ObjectNode {
    const existing = this.nodes.get(obj.id);
    if (existing && existing.kind === obj.kind) return existing;
    if (existing) this.removeNode(obj.id, existing);

    const root = new THREE.Group();
    root.name = obj.name;
    root.userData.biteId = obj.id;
    const node: ObjectNode = { kind: obj.kind, root, mesh: null, light: null, material: null };
    if (PHYSICAL_MESH_KINDS.has(obj.kind) || obj.kind === 'light' || obj.kind === 'camera') {
      const material = new THREE.MeshStandardMaterial({ color: obj.material.color, roughness: obj.material.roughness, metalness: obj.material.metalness });
      const mesh = new THREE.Mesh(geometryFor(obj.kind), material);
      mesh.castShadow = obj.kind !== 'plane';
      mesh.receiveShadow = true;
      mesh.userData.biteId = obj.id;
      root.add(mesh);
      node.mesh = mesh;
      node.material = material;
      this.pickable.push(mesh);
    }
    if (obj.kind === 'light') {
      const light = new THREE.PointLight('#ffffff', 2, 20, 1.5);
      light.castShadow = false;
      root.add(light);
      node.light = light;
    }
    this.nodes.set(obj.id, node);
    return node;
  }

  private removeNode(id: string, node: ObjectNode): void {
    if (this.selectedId === id) this.setSelected(null);
    node.root.removeFromParent();
    if (node.mesh) {
      const index = this.pickable.indexOf(node.mesh);
      if (index >= 0) this.pickable.splice(index, 1);
      node.mesh.geometry.dispose();
      node.mesh.removeFromParent();
    }
    node.material?.dispose();
    node.light?.dispose();
    this.nodes.delete(id);
    this.requestRender();
  }

  /** Places the stage camera at the world pose of the stage-camera object (default pose when none is set). */
  private stageCameraPose(): void {
    const node = this.stageCameraId ? this.nodes.get(this.stageCameraId) : undefined;
    if (!node) return;
    node.root.updateWorldMatrix(true, false);
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    node.root.matrixWorld.decompose(pos, quat, scale);
    this.stageCamera.position.copy(pos);
    this.stageCamera.quaternion.copy(quat);
    this.stageCamera.fov = 60;
    this.stageCamera.updateProjectionMatrix();
  }

  /** Picks the object under a pointer event (top-level or child). Selection changes go through onSelect. */
  private pick(event: PointerEvent): void {
    if (!this.editable || this.viewMode !== 'edit') return;
    const rect = this.canvasEl.getBoundingClientRect();
    const ndc = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.editorCamera);
    const hits = this.raycaster.intersectObjects(this.pickable.filter(isShown), false);
    const first = hits[0]?.object.userData.biteId as string | undefined;
    this.callbacks.onSelect(first ?? null);
  }

  resize(): void {
    if (this.disposed) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(width, height, false);
    this.editorCamera.aspect = width / height;
    this.editorCamera.updateProjectionMatrix();
    this.stageCamera.aspect = width / height;
    this.stageCamera.updateProjectionMatrix();
    this.requestRender();
  }

  requestRender(): void {
    this.needsRender = true;
  }

  private loop = (): void => {
    if (this.disposed) return;
    this.frameHandle = requestAnimationFrame(this.loop);
    if (!this.needsRender && !this.continuous) return;
    this.needsRender = false;
    this.orbit.update();
    if (this.viewMode === 'stage') {
      this.stageCameraPose();
      this.renderer.render(this.scene, this.stageCamera);
    } else {
      this.renderer.render(this.scene, this.editorCamera);
    }
    if (this.selectedId && this.selectionBox.visible) this.selectionBox.update();
  };

  /** Renders every animation frame while true (the program moves objects); otherwise only on change. */
  setContinuous(continuous: boolean): void {
    this.continuous = continuous;
    this.requestRender();
  }

  /** Number of meshes the stage currently manages (for leak checks in tests). */
  get meshCount(): number {
    return this.pickable.length;
  }

  get objectCount(): number {
    return this.nodes.size;
  }

  /** Exposes the scene for tests and the e2e harness. */
  get threeScene(): THREE.Scene {
    return this.scene;
  }

  get editorCameraObject(): THREE.PerspectiveCamera {
    return this.editorCamera;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frameHandle);
    this.resizeObserver.disconnect();
    this.canvasEl.removeEventListener('pointerdown', this.onPointerDown);
    this.canvasEl.removeEventListener('pointerup', this.onPointerUp);
    this.transform.removeEventListener('objectChange', this.onObjectChange);
    this.transform.dispose();
    this.orbit.dispose();
    for (const id of [...this.nodes.keys()]) {
      const node = this.nodes.get(id)!;
      this.removeNode(id, node);
    }
    this.renderer.dispose();
    this.canvasEl.remove();
  }
}
