/**
 * Three.js viewport. Two camera rigs are kept apart on purpose:
 *  - the editor camera (orbit controls) is for authoring and is never saved;
 *  - the runtime camera is the stage camera from the project settings, or the view of the selected
 *    camera object while a Play session is running.
 * The scene graph mirrors the project hierarchy so local transforms are the same numbers the inspector shows.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import type { ProjectSettings, SceneObject, Transform } from '../model/types';

export type ViewMode = 'edit' | 'play';

export interface ViewCallbacks {
  onSelect(id: string | null): void;
  onTransformCommit(id: string, transform: Transform): void;
  onPick?(id: string): void;
}

const OBJECT_KEY = 'biteObjectId';

function makeGeometry(kind: SceneObject['kind']): THREE.BufferGeometry | null {
  switch (kind) {
    case 'cube':
      return new THREE.BoxGeometry(1, 1, 1);
    case 'sphere':
      return new THREE.SphereGeometry(0.5, 32, 16);
    case 'cylinder':
      return new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
    case 'plane': {
      const g = new THREE.PlaneGeometry(1, 1);
      g.rotateX(-Math.PI / 2);
      return g;
    }
    default:
      return null;
  }
}

function eulerFromTransform(t: Transform): THREE.Euler {
  return new THREE.Euler(t.rotation[0] * THREE.MathUtils.DEG2RAD, t.rotation[1] * THREE.MathUtils.DEG2RAD, t.rotation[2] * THREE.MathUtils.DEG2RAD, 'YXZ');
}

export class SceneView {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly editorCamera: THREE.PerspectiveCamera;
  private readonly orbit: OrbitControls;
  private readonly gizmo: TransformControls;
  private readonly stageCamera = new THREE.PerspectiveCamera(50, 1, 0.05, 2000);
  private readonly ambient = new THREE.AmbientLight(0xffffff, 0.45);
  private readonly fallbackSun = new THREE.DirectionalLight(0xffffff, 1.2);
  private readonly grid = new THREE.GridHelper(60, 60, 0x3a465c, 0x252d3d);
  private readonly selectionBox = new THREE.BoxHelper(new THREE.Object3D(), 0xffd34d);
  private readonly nodes = new Map<string, THREE.Object3D>();
  private readonly pickables: THREE.Object3D[] = [];
  private structureKey = '';
  private mode: ViewMode = 'edit';
  private selectedId: string | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private pointerDown: { x: number; y: number } | null = null;
  private readonly raycaster = new THREE.Raycaster();
  private readonly disposers: (() => void)[] = [];
  private readonly canvas: HTMLCanvasElement;

  constructor(
    private readonly container: HTMLElement,
    private readonly callbacks: ViewCallbacks,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'viewport-canvas';
    container.appendChild(this.canvas);

    this.editorCamera = new THREE.PerspectiveCamera(50, 1, 0.05, 2000);
    this.editorCamera.position.set(0, 4, 12);
    this.orbit = new OrbitControls(this.editorCamera, this.canvas);
    this.orbit.target.set(0, 1, 0);
    this.orbit.enableDamping = true;
    this.orbit.update();

    this.gizmo = new TransformControls(this.editorCamera, this.canvas);
    this.gizmo.addEventListener('dragging-changed', (e: { value: unknown }) => {
      this.orbit.enabled = !e.value;
      if (!e.value) this.commitGizmo();
    });
    this.scene.add(this.gizmo.getHelper());

    this.scene.add(this.ambient, this.fallbackSun, this.grid, this.selectionBox);
    this.fallbackSun.position.set(5, 10, 7);
    this.selectionBox.visible = false;

    const onDown = (e: PointerEvent) => {
      this.pointerDown = { x: e.clientX, y: e.clientY };
    };
    const onUp = (e: PointerEvent) => {
      const start = this.pointerDown;
      this.pointerDown = null;
      if (!start || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 4) return;
      const id = this.pickAt(e.clientX, e.clientY);
      if (this.mode === 'play') {
        if (id) this.callbacks.onPick?.(id);
        return;
      }
      if (this.gizmo.dragging) return;
      this.callbacks.onSelect(id);
    };
    this.canvas.addEventListener('pointerdown', onDown);
    this.canvas.addEventListener('pointerup', onUp);
    this.disposers.push(() => this.canvas.removeEventListener('pointerdown', onDown), () => this.canvas.removeEventListener('pointerup', onUp));

    this.resize();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
  }

  get currentMode(): ViewMode {
    return this.mode;
  }

  setMode(mode: ViewMode): void {
    this.mode = mode;
    this.grid.visible = mode === 'edit';
    this.gizmo.enabled = mode === 'edit';
    this.gizmo.getHelper().visible = mode === 'edit' && this.selectedId !== null;
    this.selectionBox.visible = mode === 'edit' && this.selectedId !== null && this.nodes.has(this.selectedId);
  }

  setSelected(id: string | null): void {
    this.selectedId = id;
    const node = id ? this.nodes.get(id) : undefined;
    if (node && this.mode === 'edit') {
      this.gizmo.attach(node);
      this.gizmo.getHelper().visible = true;
      this.selectionBox.setFromObject(node);
      this.selectionBox.visible = true;
    } else {
      this.gizmo.detach();
      this.gizmo.getHelper().visible = false;
      this.selectionBox.visible = false;
    }
  }

  /**
   * Updates the scene to match `objects` (the authored project in edit mode, the runtime copies in play mode).
   * Rebuilds nodes only when the structure changes; transforms and materials are updated every call.
   */
  sync(objects: readonly SceneObject[], settings: Pick<ProjectSettings, 'backgroundColor' | 'shadows' | 'stageCamera' | 'activeCameraId'>, runtimeState?: { backgroundColor: string; activeCameraId: string | null }): void {
    const key = objects.map((o) => `${o.id}|${o.kind}|${o.parentId ?? ''}|${o.light?.kind ?? ''}`).join('\n');
    if (key !== this.structureKey) {
      this.rebuild(objects);
      this.structureKey = key;
    }
    const bg = runtimeState?.backgroundColor ?? settings.backgroundColor;
    this.scene.background = new THREE.Color(bg);
    this.renderer.shadowMap.enabled = settings.shadows;
    for (const o of objects) this.applyObject(o);
    this.updateLightsFallback(objects);
    if (this.selectedId) {
      const node = this.nodes.get(this.selectedId);
      if (node && this.selectionBox.visible) this.selectionBox.setFromObject(node);
    }
    const sc = settings.stageCamera;
    this.stageCamera.fov = sc.fov;
    this.stageCamera.position.set(...sc.position);
    this.stageCamera.lookAt(new THREE.Vector3(...sc.target));
    this.stageCamera.updateMatrixWorld();
  }

  /** Renders one frame with the camera that matches the mode (editor orbit camera, stage camera or a scene camera). */
  render(activeCameraId: string | null): void {
    this.orbit.update();
    const cam = this.cameraFor(activeCameraId);
    this.renderer.render(this.scene, cam);
  }

  private cameraFor(activeCameraId: string | null): THREE.Camera {
    if (this.mode === 'play') {
      const node = activeCameraId ? this.nodes.get(activeCameraId) : undefined;
      const camNode = node?.userData.camera as THREE.PerspectiveCamera | undefined;
      if (camNode) {
        camNode.aspect = this.aspect();
        camNode.updateProjectionMatrix();
        return camNode;
      }
      this.stageCamera.aspect = this.aspect();
      this.stageCamera.updateProjectionMatrix();
      return this.stageCamera;
    }
    return this.editorCamera;
  }

  /** Projects a screen point into a picked object id, or null. Only objects with geometry can be picked. */
  pickAt(clientX: number, clientY: number): string | null {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const cam = this.mode === 'play' ? this.stageCamera : this.editorCamera;
    this.raycaster.setFromCamera(ndc, cam);
    const hits = this.raycaster.intersectObjects(this.pickables, false);
    const first = hits[0]?.object;
    return (first?.userData[OBJECT_KEY] as string | undefined) ?? null;
  }

  /** Focuses the editor camera on an object. */
  focus(id: string): void {
    const node = this.nodes.get(id);
    if (!node) return;
    const p = new THREE.Vector3();
    node.getWorldPosition(p);
    this.orbit.target.copy(p);
    this.editorCamera.position.set(p.x + 4, p.y + 3, p.z + 6);
    this.orbit.update();
  }

  resize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.editorCamera.aspect = w / h;
    this.editorCamera.updateProjectionMatrix();
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
  }

  /** Canvas data URL for screenshots (E2E tests and the user's own captures). */
  snapshotPng(): string {
    this.render(null);
    return this.canvas.toDataURL('image/png');
  }

  get objectCount(): number {
    return this.nodes.size;
  }

  dispose(): void {
    this.resizeObserver?.disconnect();
    for (const d of this.disposers) d();
    this.gizmo.dispose();
    this.orbit.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }

  private aspect(): number {
    return this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight);
  }

  private commitGizmo(): void {
    const id = this.selectedId;
    const node = id ? this.nodes.get(id) : undefined;
    if (!id || !node || this.mode !== 'edit') return;
    const e = new THREE.Euler().setFromQuaternion(node.quaternion, 'YXZ');
    const transform: Transform = {
      position: [node.position.x, node.position.y, node.position.z],
      rotation: [e.x * THREE.MathUtils.RAD2DEG, e.y * THREE.MathUtils.RAD2DEG, e.z * THREE.MathUtils.RAD2DEG],
      scale: [node.scale.x, node.scale.y, node.scale.z],
    };
    this.callbacks.onTransformCommit(id, transform);
  }

  private rebuild(objects: readonly SceneObject[]): void {
    for (const n of this.nodes.values()) n.removeFromParent();
    this.nodes.clear();
    this.pickables.length = 0;
    const ids = new Set(objects.map((o) => o.id));
    for (const o of objects) {
      const node = this.createNode(o);
      this.nodes.set(o.id, node);
    }
    for (const o of objects) {
      const node = this.nodes.get(o.id)!;
      const parent = o.parentId && ids.has(o.parentId) ? this.nodes.get(o.parentId)! : this.scene;
      parent.add(node);
    }
    if (this.selectedId && !this.nodes.has(this.selectedId)) this.setSelected(null);
    else this.setSelected(this.selectedId);
  }

  private createNode(o: SceneObject): THREE.Object3D {
    const group = new THREE.Group();
    group.userData[OBJECT_KEY] = o.id;
    const geo = makeGeometry(o.kind);
    if (geo) {
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial());
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData[OBJECT_KEY] = o.id;
      group.add(mesh);
      this.pickables.push(mesh);
      group.userData.mesh = mesh;
    }
    if (o.kind === 'light') {
      const light = o.light?.kind === 'point' ? new THREE.PointLight(0xffffff, 1, 0, 1.2) : new THREE.DirectionalLight(0xffffff, 1);
      light.castShadow = o.light?.kind !== 'point';
      if (light instanceof THREE.DirectionalLight) {
        light.target.position.set(0, 0, -1);
        group.add(light.target);
        light.shadow.mapSize.set(1024, 1024);
        const cam = light.shadow.camera;
        cam.left = -15;
        cam.right = 15;
        cam.top = 15;
        cam.bottom = -15;
        cam.far = 60;
      }
      group.add(light);
      group.userData.light = light;
      const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.2), new THREE.MeshBasicMaterial({ color: 0xffd34d, wireframe: true }));
      marker.userData[OBJECT_KEY] = o.id;
      group.add(marker);
      this.pickables.push(marker);
    }
    if (o.kind === 'camera') {
      const cam = new THREE.PerspectiveCamera(50, 1, 0.05, 2000);
      group.add(cam);
      group.userData.camera = cam;
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.6), new THREE.MeshStandardMaterial({ color: 0xff8c1a }));
      body.userData[OBJECT_KEY] = o.id;
      group.add(body);
      this.pickables.push(body);
    }
    return group;
  }

  private applyObject(o: SceneObject): void {
    const node = this.nodes.get(o.id);
    if (!node) return;
    node.position.set(o.transform.position[0], o.transform.position[1], o.transform.position[2]);
    node.quaternion.setFromEuler(eulerFromTransform(o.transform));
    node.scale.set(o.transform.scale[0], o.transform.scale[1], o.transform.scale[2]);
    node.visible = o.visible;
    const mesh = node.userData.mesh as THREE.Mesh | undefined;
    if (mesh) {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.color.set(o.material.color);
      mat.opacity = o.material.opacity;
      mat.metalness = o.material.metalness;
      mat.roughness = o.material.roughness;
      if (mat.transparent !== (o.material.opacity < 1)) {
        mat.transparent = o.material.opacity < 1;
        mat.needsUpdate = true;
      }
    }
    const light = node.userData.light as THREE.Light | undefined;
    if (light && o.light) {
      light.intensity = o.light.intensity;
    }
    if (o.kind === 'camera' && o.camera) {
      const cam = node.userData.camera as THREE.PerspectiveCamera | undefined;
      if (cam && cam.fov !== o.camera.fov) {
        cam.fov = o.camera.fov;
        cam.updateProjectionMatrix();
      }
    }
  }

  private updateLightsFallback(objects: readonly SceneObject[]): void {
    const hasLight = objects.some((o) => o.kind === 'light' && o.visible);
    this.fallbackSun.visible = !hasLight;
    this.ambient.intensity = hasLight ? 0.3 : 0.45;
  }
}
