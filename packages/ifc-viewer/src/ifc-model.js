export function convertIfc(api, buffer, onProgress = () => {}) {
  const bytes = new Uint8Array(buffer);
  const header = new TextDecoder().decode(bytes.subarray(0, 4096));
  if (!/^\s*ISO-10303-21\s*;/i.test(header)) {
    throw new Error('This is not an IFC STEP file. Export your model as an .ifc file first.');
  }
  onProgress(0.05, 'Reading IFC data on your device…');
  const modelID = api.OpenModel(bytes, {
    COORDINATE_TO_ORIGIN: true,
    ALLOW_INCOMPATIBLE_SCHEMA_ALIASES: false,
  });
  if (modelID < 0) throw new Error('The IFC data or schema could not be read.');
  try {
    const version = api.GetModelSchema(modelID);
    const meshes = [];
    const materials = [];
    const geometryCache = new Map();
    const materialCache = new Map();
    let triangleCount = 0;
    let elementCount = 0;
    api.StreamAllMeshes(modelID, (flatMesh, index, total) => {
      if (index % 100 === 0) {
        onProgress(0.1 + (0.8 * index) / Math.max(total, 1), 'Building the 3D model…');
      }
      if (flatMesh.geometries.size()) elementCount++;
      for (let i = 0; i < flatMesh.geometries.size(); i++) {
        const placed = flatMesh.geometries.get(i);
        let buffers = geometryCache.get(placed.geometryExpressID);
        if (!buffers) {
          const geometry = api.GetGeometry(modelID, placed.geometryExpressID);
          try {
            const vertices = api.GetVertexArray(
              geometry.GetVertexData(),
              geometry.GetVertexDataSize(),
            );
            const indices = api.GetIndexArray(geometry.GetIndexData(), geometry.GetIndexDataSize());
            const positions = new Float32Array(vertices.length / 2);
            const normals = new Float32Array(vertices.length / 2);
            for (let vertex = 0; vertex < vertices.length / 6; vertex++) {
              positions.set(vertices.subarray(vertex * 6, vertex * 6 + 3), vertex * 3);
              normals.set(vertices.subarray(vertex * 6 + 3, vertex * 6 + 6), vertex * 3);
            }
            buffers = { positions, normals, indices };
            geometryCache.set(placed.geometryExpressID, buffers);
          } finally {
            geometry.delete();
          }
        }
        if (!buffers.indices.length) continue;
        const { x, y, z, w } = placed.color;
        const rgba = [x, y, z, w];
        const key = rgba.join(',');
        if (!materialCache.has(key)) {
          materialCache.set(key, materials.length);
          materials.push({ baseColor: rgba });
        }
        meshes.push({
          ...buffers,
          transform: Array.from(placed.flatTransformation),
          materialIndex: materialCache.get(key),
        });
        triangleCount += buffers.indices.length / 3;
      }
    });
    if (!meshes.length) throw new Error('No drawable 3D geometry was found in this IFC file.');
    return { meshes, materials, version, stats: { triangleCount, elementCount }, warnings: [] };
  } finally {
    api.CloseModel(modelID);
  }
}
