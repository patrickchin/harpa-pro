// Ambient module declarations for static image asset imports so
// `import iconAsset from '../../assets/icon.png'` typechecks. At
// runtime, Metro returns the asset reference; tests via Vite return
// a string URL. Either is valid for `<Image source={...} />`.
declare module '*.png';
declare module '*.jpg';
declare module '*.jpeg';
declare module '*.gif';
declare module '*.webp';
declare module '*.svg';
