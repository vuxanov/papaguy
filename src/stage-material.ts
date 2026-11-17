import type { MeshStandardMaterial } from 'three';

export function dressMaterial(material: MeshStandardMaterial, wing?: { amount: number; folded: boolean }, eyes?: { left: number; right: number }) {
  material.customProgramCacheKey = () => wing ? (wing.folded ? 'folded wing' : 'open wing') : eyes ? 'body with scanned eyelids' : 'body fade';
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'varying float stageHeight;\n' + shader.vertexShader.replace(
      '#include <project_vertex>',
      '#include <project_vertex>\nstageHeight = (modelMatrix * vec4(transformed, 1.0)).y;',
    );
    let coverage = '';
    if (eyes) {
      const lidLevels = new Float32Array(2);
      shader.uniforms.eyelids = {
        get value() {
          lidLevels[0] = eyes.left;
          lidLevels[1] = eyes.right;
          return lidLevels;
        },
      };
      shader.fragmentShader = 'uniform vec2 eyelids;\n' + shader.fragmentShader.replace(
        '#include <map_fragment>',
        `#include <map_fragment>
         vec2 eyeA = (vMapUv - vec2(.124, .407)) / vec2(.011, .014);
         vec2 eyeB = (vMapUv - vec2(.672, .441)) / vec2(.012, .012);
         float fillA = (1.0 - smoothstep(.77, 1.0, length(eyeA)))
                     * smoothstep(-.12, .14, eyelids.x * 2.15 - 1.12 - eyeA.y) * step(.04, eyelids.x);
         float fillB = (1.0 - smoothstep(.77, 1.0, length(eyeB)))
                     * smoothstep(-.12, .14, eyelids.y * 2.15 - 1.12 - eyeB.y) * step(.04, eyelids.y);
         float crease = max(exp(-15.0 * abs(eyeA.y - .13)) * fillA, exp(-15.0 * abs(eyeB.y - .15)) * fillB);
         diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(.51, .39, .33), vec3(.15, .07, .055), crease * .72), max(fillA, fillB));`,
      );
    }

    if (wing?.folded) {
      shader.vertexShader = 'varying float featherHeight;\n' + shader.vertexShader.replace(
        '#include <begin_vertex>', '#include <begin_vertex>\nfeatherHeight = position.y;',
      );
      shader.fragmentShader = 'varying float featherHeight;\n' + shader.fragmentShader.replace(
        '#include <map_fragment>',
        `#include <map_fragment>
         float yellow = smoothstep(.08, .30, diffuseColor.g / max(.01, diffuseColor.r))
                      * smoothstep(.025, .10, diffuseColor.r - diffuseColor.b);
         float olive = yellow * (1.0 - smoothstep(.465, .535, featherHeight));
         diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(.55, 1.18, 1.12), olive * .67);`,
      );
    }
    if (wing) {
      shader.uniforms.wingAmount = {
        get value() { return wing.amount; },
      };
      shader.fragmentShader = 'uniform float wingAmount;\n' + shader.fragmentShader;
      coverage = `
        float grain = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(.06711056, .00583715))));
        if (grain ${wing.folded ? '<' : '>='} wingAmount) discard;
      `;
    }
    shader.fragmentShader = 'varying float stageHeight;\n' + shader.fragmentShader.replace(
      '#include <tonemapping_fragment>',
      coverage + 'gl_FragColor.rgb *= smoothstep(-0.235, -0.12, stageHeight);\n#include <tonemapping_fragment>',
    );
  };
}
