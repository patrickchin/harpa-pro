import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const $ = (id) => document.getElementById(id);
const viewer = document.querySelector('.viewer');
const input = $('model-file');
const canvas = $('canvas');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
} catch {
  $('status').textContent =
    'This browser could not start WebGL. Try a recent desktop browser with hardware acceleration enabled.';
  input.disabled = true;
  document.querySelector('.file-label').classList.add('disabled');
  throw new Error('WebGL unavailable');
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xffffff, 0x596b80, 2.5));
const light = new THREE.DirectionalLight(0xffffff, 2);
light.position.set(50, 100, 60);
scene.add(light);
const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 10000);
camera.position.set(20, 20, 20);
const controls = new OrbitControls(camera, canvas);
const model = new THREE.Group();
scene.add(model);
let worker;
let generation = 0;
let busy = false;
let started = 0;
let size = 1;
const center = new THREE.Vector3();

function render() {
  renderer.render(scene, camera);
}
controls.addEventListener('change', render);
new ResizeObserver(() => {
  const { width, height } = canvas.getBoundingClientRect();
  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(height, 1);
  camera.updateProjectionMatrix();
  render();
}).observe(canvas);

function disposeModel() {
  for (const mesh of [...model.children]) {
    mesh.geometry.dispose();
    mesh.material.dispose();
    model.remove(mesh);
  }
}

function setBusy(value) {
  busy = value;
  $('cancel').hidden = !value;
  $('progress').hidden = !value;
  $('clear').disabled = !value && !model.children.length && !input.files.length;
}

function status(message, state) {
  $('status').textContent = message;
  viewer.dataset.state = state;
}

function warmWorker() {
  worker?.terminate();
  const next = new Worker(new URL('./converter.js', import.meta.url), { type: 'module' });
  worker = next;
  next.onmessage = ({ data }) => {
    if (next !== worker) return;
    if (data.type === 'ready') {
      viewer.dataset.workerReady = 'true';
      return;
    }
    if (data.type === 'progress') {
      $('progress').value = data.ratio;
      $('status').textContent = data.message;
    } else if (data.type === 'result') {
      try {
        display(data);
      } catch (error) {
        fail(error.message);
      }
    } else if (data.type === 'error') fail(data.message);
  };
  next.onerror = () =>
    fail('The reader stopped unexpectedly. Try a smaller or different IFC file.');
}

function reset(reuseReadyWorker = false) {
  const canReuse = reuseReadyWorker && !busy && worker && viewer.dataset.workerReady === 'true';
  generation++;
  disposeModel();
  $('stats').hidden = true;
  $('warning-panel').hidden = true;
  $('fit').disabled = true;
  $('top').disabled = true;
  $('empty-state').hidden = false;
  $('fidelity').textContent = 'No model loaded';
  viewer.dataset.meshes = '0';
  viewer.dataset.triangles = '0';
  if (!canReuse) viewer.dataset.workerReady = 'false';
  setBusy(false);
  if (!canReuse) warmWorker();
  render();
}

function fail(message) {
  worker?.terminate();
  worker = undefined;
  viewer.dataset.workerReady = 'false';
  disposeModel();
  $('fit').disabled = true;
  $('top').disabled = true;
  setBusy(false);
  $('empty-state').hidden = false;
  status(`Could not show this file. ${message}`, 'error');
  render();
}

function fit(top = false) {
  const box = new THREE.Box3().setFromObject(model);
  if (box.isEmpty()) return;
  box.getCenter(center);
  size = Math.max(box.getSize(new THREE.Vector3()).length(), 0.01);
  const angle = Math.min(
    THREE.MathUtils.degToRad(camera.fov),
    2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect),
  );
  const distance = (size / 2 / Math.sin(angle / 2)) * 1.1;
  camera.near = size / 1000;
  camera.far = size * 100;
  camera.updateProjectionMatrix();
  const direction = top
    ? new THREE.Vector3(0, 1, 0.0001)
    : new THREE.Vector3(1, 0.75, 1).normalize();
  camera.position.copy(center).addScaledVector(direction, distance);
  controls.target.copy(center);
  controls.maxDistance = size * 50;
  controls.minDistance = size / 1000;
  controls.update();
  render();
}

function display(data) {
  for (const batch of data.meshes) {
    if (!batch.positions.length || !batch.indices.length) continue;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(batch.positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(batch.indices, 1));
    geometry.setAttribute('normal', new THREE.BufferAttribute(batch.normals, 3));
    const rgba = data.materials[batch.materialIndex]?.baseColor ?? [0.6, 0.65, 0.7, 1];
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setRGB(...rgba.slice(0, 3), THREE.SRGBColorSpace),
      roughness: 0.85,
      side: THREE.DoubleSide,
      transparent: rgba[3] < 1,
      opacity: rgba[3],
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.matrix.fromArray(batch.transform);
    mesh.matrixAutoUpdate = false;
    model.add(mesh);
  }
  if (!model.children.length)
    throw new Error('No drawable 3D geometry was found in this IFC file.');
  $('fidelity').textContent = 'Local IFC model';
  const stats = [
    ['IFC schema', data.version ?? 'Unknown'],
    ['Elements', data.stats.elementCount.toLocaleString()],
    ['Triangles', data.stats.triangleCount.toLocaleString()],
    ['Read time', `${((performance.now() - started) / 1000).toFixed(1)} s`],
  ];
  $('stats').replaceChildren(
    ...stats.flatMap(([name, value]) => {
      const term = document.createElement('dt');
      term.textContent = name;
      const definition = document.createElement('dd');
      definition.textContent = value;
      return [term, definition];
    }),
  );
  $('stats').hidden = false;
  $('warnings').replaceChildren(
    ...data.warnings.map((message) => {
      const item = document.createElement('li');
      item.textContent = message;
      return item;
    }),
  );
  $('warning-count').textContent = `(${data.warnings.length})`;
  $('warning-panel').hidden = !data.warnings.length;
  $('empty-state').hidden = true;
  $('fit').disabled = false;
  $('top').disabled = false;
  setBusy(false);
  status('Model ready. Your file stays on this device.', 'ready');
  viewer.dataset.meshes = String(model.children.length);
  viewer.dataset.triangles = String(data.stats.triangleCount);
  viewer.dataset.version = String(data.version);
  viewer.dataset.method = 'web-ifc';
  fit();
  worker.terminate();
  worker = undefined;
  viewer.dataset.workerReady = 'false';
}

input.addEventListener('change', async () => {
  const file = input.files[0];
  if (!file) return;
  reset(true);
  document.querySelector('.file-info').hidden = false;
  $('file-name').textContent = file.name;
  $('file-size').textContent = `${(file.size / 1048576).toFixed(1)} MB · Local file`;
  if (!/\.ifc$/i.test(file.name)) {
    fail('Choose an .ifc file. Revit models must first be exported to IFC.');
    return;
  }
  if (!file.size || file.size > 150 * 1048576) {
    fail('Choose a non-empty file of 150 MB or less.');
    return;
  }
  const current = generation;
  setBusy(true);
  $('progress').value = 0;
  status('Reading file on your device…', 'reading');
  started = performance.now();
  try {
    const buffer = await file.arrayBuffer();
    if (current !== generation) return;
    worker.postMessage({ buffer, name: file.name }, [buffer]);
  } catch (error) {
    if (current === generation) fail(error.message);
  }
});
$('fit').onclick = () => fit();
$('top').onclick = () => fit(true);
$('clear').onclick = () => {
  input.value = '';
  reset();
  document.querySelector('.file-info').hidden = true;
  status('Ready to open a local file.', 'empty');
};
$('cancel').onclick = () => {
  input.value = '';
  reset();
  document.querySelector('.file-info').hidden = true;
  status('Reading cancelled. Choose a file to try again.', 'empty');
};
canvas.addEventListener('keydown', (event) => {
  if (!model.children.length) return;
  if (event.key === 'Home') {
    event.preventDefault();
    fit();
  }
  if (event.key === '+' || event.key === '-') {
    event.preventDefault();
    camera.position
      .sub(controls.target)
      .multiplyScalar(event.key === '+' ? 0.8 : 1.25)
      .add(controls.target);
    controls.update();
    render();
  }
});
warmWorker();
render();
