import {
  Color,
  DataTexture,
  NearestFilter,
  RedFormat,
  type Texture,
  Vector2,
} from "three";
import type { Manifest } from "../mission/types";
import { type ColorStop, type AnalysisMode } from "./terrain-style";
import type { TerrainDisplay } from "./terrain-display";
import type { LayerSettings } from "../layers/layer-state";

export const terrainVertex = /* glsl */ `
varying vec2 terrainUv;
varying vec3 terrainNormal;
varying vec3 terrainPosition;
void main() {
  terrainUv = uv;
  terrainNormal = normal;
  terrainPosition = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const terrainFragment = /* glsl */ `
varying vec2 terrainUv;
varying vec3 terrainNormal;
varying vec3 terrainPosition;
uniform sampler2D opticalMap;
uniform sampler2D scalarMap;
uniform vec2 gridSize;
uniform vec2 localOrigin;
uniform float opticalOpacity;
uniform float analysisOpacity;
uniform float datum;
uniform float relief;
uniform int mode;
uniform bool surveyGrid;
uniform bool contours;
uniform bool surveyOnly;
uniform bool physical;
uniform vec4 stops;
uniform vec3 palette[4];

float lineAt(float value, float spacing) {
  float phase = value / spacing;
  float edge = abs(fract(phase + 0.5) - 0.5);
  float width = max(fwidth(phase), 0.0001);
  return (1.0 - smoothstep(width * 0.33, width, edge)) *
    (1.0 - smoothstep(0.12, 0.4, width));
}
vec3 colorAt(float value) {
  vec3 fraction = clamp((value - stops.xyz) / max(stops.yzw - stops.xyz, vec3(0.0001)), 0.0, 1.0);
  vec3 result = mix(palette[0], palette[1], fraction.x);
  result = mix(result, palette[2], fraction.y);
  result = mix(result, palette[3], fraction.z);
  return result;
}
void main() {
  vec3 normal = normalize(terrainNormal);
  float light = clamp(dot(normal, normalize(vec3(-0.65, 0.85, -0.45))), 0.0, 1.0);
  vec3 base = vec3(0.085 + light * 0.65);
  float optical = texture2D(opticalMap, terrainUv).r;
  vec3 photographed = vec3((0.29 + optical * 0.57) * (0.55 + light * 0.55));
  if (physical) {
    photographed = mix(vec3(0.071, 0.033, 0.018), vec3(0.67, 0.46, 0.30), pow(optical, 0.58));
    photographed *= 0.52 + light * 0.62;
    base *= vec3(0.82, 0.63, 0.48);
  }
  base = mix(base, photographed, opticalOpacity);
  float heightM = terrainPosition.y / relief + datum;
  if (mode != 0) {
    vec2 sampleUv = (vec2(terrainUv.x, 1.0 - terrainUv.y) * (gridSize - 1.0) + 0.5) / gridSize;
    float raw = floor(texture2D(scalarMap, sampleUv).r * 255.0 + 0.5);
    bool valid = (mode == 1 && raw < 255.0) || mode == 2 || (mode == 3 && raw > 0.0);
    float value = mode == 1 ? raw / 4.0 : mode == 2 ? heightM : raw;
    if (valid) base = mix(base, colorAt(value), analysisOpacity);
  }
  vec2 local = vec2(terrainPosition.x, -terrainPosition.z) + localOrigin;
  float gridLine = surveyGrid ? max(lineAt(local.x, 100.0), lineAt(local.y, 100.0)) : 0.0;
  float contourLine = contours ? lineAt(heightM, 10.0) : 0.0;
  base = mix(base, vec3(0.035), gridLine * 0.35);
  base = mix(base, vec3(0.98), contourLine * 0.64);
  gl_FragColor = surveyOnly
    ? vec4(mix(vec3(0.45), vec3(0.98), contourLine), max(gridLine * 0.3, contourLine * 0.48))
    : vec4(base, 1.0);
  #include <colorspace_fragment>
}
`;

export function createScalarTexture(
  bytes: Uint8Array,
  width: number,
  height: number,
) {
  const texture = new DataTexture(bytes, width, height, RedFormat);
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

export function terrainUniforms(
  optical: Texture | null,
  scalar: Texture,
  analysis: AnalysisMode,
  manifest: Manifest,
  layers: LayerSettings,
  display: TerrainDisplay,
  colorStops: ColorStop[],
) {
  const stops = colorStops.length ? colorStops : [{ value: 0, color: "#fff" }];
  const padded = Array.from(
    { length: 4 },
    (_, i) => stops[Math.min(i, stops.length - 1)],
  );
  const { westM, eastM, southM, northM } = manifest.bounds;
  return {
    opticalMap: { value: optical ?? scalar },
    scalarMap: { value: scalar },
    gridSize: { value: new Vector2(manifest.grid.width, manifest.grid.height) },
    localOrigin: {
      value: new Vector2((westM + eastM) / 2, (southM + northM) / 2),
    },
    opticalOpacity: {
      value: optical && layers.optical.visible ? layers.optical.opacity : 0,
    },
    analysisOpacity: { value: layers.analysisOpacity },
    datum: { value: manifest.elevationRangeM[0] },
    relief: { value: display.scale },
    mode: {
      value: ["none", "slope", "elevation", "thermal"].indexOf(analysis),
    },
    surveyGrid: { value: display.grid },
    contours: { value: display.contours },
    surveyOnly: { value: display.mode === "mesh" || display.mode === "points" },
    physical: { value: display.mode === "physical" },
    stops: { value: padded.map((s) => s.value) },
    palette: { value: padded.map((s) => new Color(s.color)) },
  };
}
