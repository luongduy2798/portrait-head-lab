"use strict";
(() => {
  // src/core/shape.ts
  var shapeControls = [
    ["faceWidth", "\u0110\u1ED9 r\u1ED9ng m\u1EB7t"],
    ["faceLength", "Chi\u1EC1u d\xE0i m\u1EB7t"],
    ["foreheadHeight", "\u0110\u1ED9 cao tr\xE1n"],
    ["foreheadWidth", "\u0110\u1ED9 r\u1ED9ng tr\xE1n"],
    ["templeWidth", "Th\xE1i d\u01B0\u01A1ng"],
    ["cheekboneWidth", "G\xF2 m\xE1"],
    ["cheekFullness", "\u0110\u1ED9 \u0111\u1EA7y m\xE1"],
    ["jawWidth", "\u0110\u1ED9 r\u1ED9ng h\xE0m"],
    ["jawAngle", "G\xF3c h\xE0m"],
    ["chinWidth", "\u0110\u1ED9 r\u1ED9ng c\u1EB1m"],
    ["chinLength", "\u0110\u1ED9 d\xE0i c\u1EB1m"],
    ["eyeSpacing", "Kho\u1EA3ng c\xE1ch m\u1EAFt"],
    ["eyeSize", "K\xEDch th\u01B0\u1EDBc m\u1EAFt"],
    ["eyeTilt", "\u0110\u1ED9 nghi\xEAng m\u1EAFt"],
    ["eyeOpening", "\u0110\u1ED9 m\u1EDF m\u1EAFt"],
    ["browArch", "\u0110\u1ED9 cong m\xE0y"],
    ["browHeight", "\u0110\u1ED9 cao l\xF4ng m\xE0y"],
    ["noseWidth", "\u0110\u1ED9 r\u1ED9ng m\u0169i"],
    ["noseLength", "Chi\u1EC1u d\xE0i m\u0169i"],
    ["noseBridge", "S\u1ED1ng m\u0169i"],
    ["noseTip", "\u0110\u1EA7u m\u0169i"],
    ["mouthWidth", "\u0110\u1ED9 r\u1ED9ng mi\u1EC7ng"],
    ["lipFullness", "\u0110\u1ED9 d\xE0y m\xF4i"],
    ["earSize", "K\xEDch th\u01B0\u1EDBc tai"],
    ["earHeight", "\u0110\u1ED9 cao tai"]
  ];
  var clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  var gaussian = (value, center, width) => Math.exp(-(((value - center) / width) ** 2));
  var smoothstep = (value) => {
    const t = clamp(value, 0, 1);
    return t * t * (3 - 2 * t);
  };
  function deformPoint(point, part, params, expression = {}) {
    const [x, y, z] = point;
    const p = (key) => clamp(params[key] ?? 0, -1, 1);
    if (part === "cranium" || part === "bridge") {
      const crown = gaussian(y, 7, 4);
      const temple = gaussian(y, 3.5, 3);
      return [
        x + x * (0.025 * p("faceWidth") + 0.06 * p("foreheadWidth") * crown + 0.035 * p("templeWidth") * temple),
        y + 0.3 * p("foreheadHeight") * crown + 0.15 * p("faceLength") * clamp(y / 10, -1, 1),
        z
      ];
    }
    if (part === "ear") {
      const side = Math.sign(x) || 1;
      return [
        x + x * 0.025 * p("faceWidth") + (x - side * 7.3) * 0.25 * p("earSize"),
        y + y * 0.025 * p("faceLength") + (y - 0.7) * 0.25 * p("earSize") + 0.9 * p("earHeight"),
        z
      ];
    }
    if (part === "neck") {
      const lowerJaw = gaussian(y, -8, 3);
      return [x + x * (0.025 * p("faceWidth") + 0.04 * p("jawWidth") * lowerJaw), y + 0.12 * p("faceLength"), z];
    }
    const outerFaceWeight = smoothstep((Math.abs(x) - 4.2) / 3.5);
    let dx = x * 0.2 * p("faceWidth") * outerFaceWeight;
    let dy = y * 0.1 * p("faceLength");
    let dz = 0;
    const front = part === "face" ? 1 : part === "cranium" ? 0.3 : 0;
    const forehead = gaussian(y, 7, 4);
    dx += x * 0.15 * p("foreheadWidth") * forehead;
    dy += 1.2 * p("foreheadHeight") * forehead;
    dx += x * 0.1 * p("templeWidth") * gaussian(y, 3.5, 3);
    const cheek = gaussian(y, -0.8, 3) * gaussian(Math.abs(x), 5, 2.5);
    dx += Math.sign(x) * 0.9 * p("cheekboneWidth") * cheek;
    dz += 0.9 * p("cheekFullness") * cheek * front;
    const jaw = gaussian(y, -5.7, 2.6);
    dx += x * 0.17 * p("jawWidth") * jaw;
    dy += 0.85 * p("jawAngle") * jaw * gaussian(Math.abs(x), 5, 2);
    const chin = gaussian(y, -8.8, 2.1);
    dx += x * 0.3 * p("chinWidth") * chin;
    dy -= 1.25 * p("chinLength") * chin;
    const eye = gaussian(Math.abs(x), 3.15, 1.8) * gaussian(y, 2.5, 1.3) * front;
    dx += Math.sign(x) * 0.65 * p("eyeSpacing") * eye;
    dx += (x - Math.sign(x) * 3.15) * 0.2 * p("eyeSize") * eye;
    dy += (y - 2.5) * 0.35 * p("eyeSize") * eye;
    dy += (y - 2.5) * 0.5 * p("eyeOpening") * eye;
    dy += (Math.abs(x) - 3.15) * 0.18 * p("eyeTilt") * eye;
    dy += 0.6 * p("browHeight") * gaussian(y, 4.2, 1.2) * gaussian(Math.abs(x), 3, 2) * front;
    dy += 0.65 * p("browArch") * gaussian(y, 4.6, 0.9) * gaussian(Math.abs(x), 3.4, 1.1) * front;
    const nose = gaussian(x, 0, 1.7) * gaussian(y, -0.1, 2.6) * front;
    dx += x * 0.35 * p("noseWidth") * nose;
    dy -= 0.8 * p("noseLength") * nose;
    dz += p("noseBridge") * gaussian(x, 0, 1) * gaussian(y, 1.5, 2.2) * front;
    dz += p("noseTip") * gaussian(x, 0, 1.2) * gaussian(y, -1.1, 1.1) * front;
    const mouth = gaussian(x, 0, 2.6) * gaussian(y, -4.4, 1.4) * front;
    dx += x * 0.25 * p("mouthWidth") * mouth;
    dy += (y + 4.3) * 0.4 * p("lipFullness") * mouth;
    dz += 0.35 * p("lipFullness") * mouth;
    dy -= (expression.jawOpen ?? 0) * 1.4 * gaussian(y, -6, 3) * front;
    dy += (expression.smile ?? 0) * 0.75 * gaussian(Math.abs(x), 2, 1) * gaussian(y, -4.3, 1.2) * front;
    dy -= (expression.blink ?? 0) * (y - 2.5) * 0.45 * eye;
    return [x + dx, y + dy, z + dz];
  }
  function rotate(point, camera) {
    const [x, y, z] = point;
    const y1 = y * Math.cos(camera.rx) - z * Math.sin(camera.rx);
    const z1 = y * Math.sin(camera.rx) + z * Math.cos(camera.rx);
    const x2 = x * Math.cos(camera.ry) + z1 * Math.sin(camera.ry);
    const z2 = -x * Math.sin(camera.ry) + z1 * Math.cos(camera.ry);
    return [x2 * Math.cos(camera.rz) - y1 * Math.sin(camera.rz), x2 * Math.sin(camera.rz) + y1 * Math.cos(camera.rz), z2];
  }
  function project(point, camera) {
    const [x, y] = rotate(point, camera);
    return [camera.tx + x * camera.scale, camera.ty - y * camera.scale];
  }

  // src/core/visibility.ts
  var eyeContours = [
    { upper: [33, 246, 161, 160, 159, 158, 157, 173, 133], lower: [33, 7, 163, 144, 145, 153, 154, 155, 133], lid: [130, 247, 30, 29, 27, 28, 56, 190, 243] },
    { upper: [362, 398, 384, 385, 386, 387, 388, 466, 263], lower: [362, 382, 381, 380, 374, 373, 390, 249, 263], lid: [463, 414, 286, 258, 257, 259, 260, 467, 359] }
  ];
  var browContours = [
    { upper: [70, 63, 105, 66, 107], lower: [46, 53, 52, 65, 55] },
    { upper: [336, 296, 334, 293, 300], lower: [285, 295, 282, 283, 276] }
  ];
  var outerLip = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146];
  var eyeIds = new Set(eyeContours.flatMap(({ upper, lower }) => [...upper, ...lower]));
  var browIds = new Set(browContours.flatMap(({ upper, lower }) => [...upper, ...lower]));
  var eyeCorners = /* @__PURE__ */ new Set([33, 133, 362, 263]);
  function maskAt(mask, analysis, x, y) {
    const px = clamp(x * analysis.maskWidth - 0.5, 0, analysis.maskWidth - 1);
    const py = clamp(y * analysis.maskHeight - 0.5, 0, analysis.maskHeight - 1);
    const ix = Math.floor(px), iy = Math.floor(py), fx = px - ix, fy = py - iy;
    const at = (cx, cy) => mask[Math.min(cy, analysis.maskHeight - 1) * analysis.maskWidth + Math.min(cx, analysis.maskWidth - 1)];
    return (at(ix, iy) * (1 - fx) + at(ix + 1, iy) * fx) * (1 - fy) + (at(ix, iy + 1) * (1 - fx) + at(ix + 1, iy + 1) * fx) * fy;
  }
  function landmarkVisibility(analysis, options) {
    const eyeDistance = Math.hypot(analysis.landmarks[263][0] - analysis.landmarks[33][0], analysis.landmarks[263][1] - analysis.landmarks[33][1]);
    const radius = eyeDistance * 0.045;
    return analysis.landmarks.slice(0, 468).map(([x, y], id) => {
      let hair = 0, accessory = 0;
      for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) {
        hair += maskAt(analysis.hair, analysis, x + dx * radius, y + dy * radius) / 5;
        accessory += maskAt(analysis.accessories, analysis, x + dx * radius, y + dy * radius) / 5;
      }
      let weight = clamp(1 - Math.max(hair * (browIds.has(id) ? 0.65 : 1.15), accessory * 1.3), 0.12, 1);
      if (options.occludedEyes && eyeIds.has(id)) weight = Math.min(weight, eyeCorners.has(id) ? 0.4 : 0.12);
      return weight;
    });
  }
  function eyeVisibility(weights) {
    return [...eyeIds].reduce((sum, id) => sum + weights[id], 0) / eyeIds.size;
  }

  // src/core/identity.ts
  function relativeDepthConfidence(analysis) {
    const points = analysis.landmarks;
    const width = Math.hypot(points[263][0] - points[33][0], points[263][1] - points[33][1]);
    const depths = points.slice(0, 468).map((point) => point[2]).sort((a, b) => a - b);
    const spread = (depths[444] - depths[23]) / Math.max(width, 1e-6);
    return clamp((spread - 0.08) / 0.25, 0, 1) * clamp((2.5 - spread) / 0.75, 0, 1);
  }
  function unrotate([x, y, z], camera) {
    const x1 = x * Math.cos(camera.rz) + y * Math.sin(camera.rz);
    const y1 = -x * Math.sin(camera.rz) + y * Math.cos(camera.rz);
    const x2 = x1 * Math.cos(camera.ry) - z * Math.sin(camera.ry);
    const z2 = x1 * Math.sin(camera.ry) + z * Math.cos(camera.ry);
    return [x2, y1 * Math.cos(camera.rx) + z2 * Math.sin(camera.rx), -y1 * Math.sin(camera.rx) + z2 * Math.cos(camera.rx)];
  }
  function facePositions(template, params, identity, expression = {}) {
    return template.positions.slice(0, template.canonicalCount).map((point, id) => {
      const shaped = deformPoint(point, "face", params, expression);
      const delta = identity?.deltas[id];
      return delta ? shaped.map((value, axis) => value + delta[axis]) : shaped;
    });
  }
  function faceDetailWeights(template) {
    const features = /* @__PURE__ */ new Set([
      ...template.boundary,
      ...eyeContours.flatMap(({ upper, lower }) => [...upper, ...lower]),
      1,
      2,
      4,
      5,
      6,
      19,
      94,
      97,
      98,
      168,
      195,
      326,
      327
    ]);
    return Array.from({ length: template.canonicalCount }, (_, id) => features.has(id) ? 0.55 : 0.2);
  }
  function fitFaceIdentity(template, analysis, params, expression, camera, landmarkWeights) {
    const base = facePositions(template, params, void 0, expression).map((point) => rotate(point, camera));
    const count = template.canonicalCount;
    const neighbors = base.map(() => /* @__PURE__ */ new Set());
    const normals = base.map(() => [0, 0, 0]);
    for (const [a, b, c] of template.triangles.slice(0, template.faceTriangleCount)) {
      neighbors[a].add(b).add(c);
      neighbors[b].add(a).add(c);
      neighbors[c].add(a).add(b);
      const ab = base[b].map((value, axis) => value - base[a][axis]);
      const ac = base[c].map((value, axis) => value - base[a][axis]);
      const normal = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
      for (const id of [a, b, c]) for (let axis = 0; axis < 3; axis++) normals[id][axis] += normal[axis];
    }
    const smile = clamp(((expression.smile ?? 0) - 0.35) / 0.65, 0, 1);
    const jaw = clamp(((expression.jawOpen ?? 0) - 0.25) / 0.75, 0, 1);
    const blink = clamp(((expression.blink ?? 0) - 0.55) / 0.45, 0, 1);
    const confidence = landmarkWeights.map((weight, id) => {
      const [x, y] = template.positions[id];
      const mouth = Math.exp(-((x / 3.8) ** 2) - ((y + 4.3) / 2.3) ** 2);
      const lowerFace = Math.exp(-(((y + 7) / 3.5) ** 2));
      const eye = Math.exp(-(((Math.abs(x) - 3.15) / 1.8) ** 2) - ((y - 2.5) / 1.3) ** 2);
      const expressionRisk = Math.max(smile * mouth, jaw * lowerFace, blink * eye);
      return clamp((weight - 0.2) / 0.8, 0, 1) ** 2 * (1 - 0.85 * expressionRisk);
    });
    const depthConfidence = relativeDepthConfidence(analysis) * clamp(1 - Math.max(Math.abs(camera.rx), Math.abs(camera.ry)) / 0.9, 0.15, 1);
    const references = [33, 133, 263, 362, 50, 101, 280, 330, 10, 152];
    let origin = 0, total = 0;
    for (const id of references) {
      const weight = confidence[id];
      origin += (base[id][2] + analysis.landmarks[id][2] / camera.scale) * weight;
      total += weight;
    }
    if (total < 1e-6) return { version: 1, deltas: base.map(() => [0, 0, 0]), depthConfidence: 0 };
    origin /= total;
    const faceWidth = Math.hypot(...template.positions[263].map((v, axis) => v - template.positions[33][axis]));
    const limits = [faceWidth * 0.18, faceWidth * 0.18, faceWidth * 0.24];
    const targets = base.map((point, id) => {
      const [x, y, z] = analysis.landmarks[id];
      return [(x - camera.tx) / camera.scale - point[0], (camera.ty - y) / camera.scale - point[1], -z / camera.scale + origin - point[2]];
    });
    const dataWeights = targets.map((delta, id) => {
      const normal = normals[id];
      const front = clamp(normal[2] / Math.max(1e-6, Math.hypot(...normal)) / 0.5, 0, 1);
      return delta.map((value, axis) => {
        const reliability = confidence[id] * (axis === 2 ? depthConfidence * front * 0.55 : 1);
        return reliability / (1 + (Math.abs(value) / limits[axis]) ** 4);
      });
    });
    let field = Array.from({ length: count }, () => [0, 0, 0]);
    for (let iteration = 0; iteration < 24; iteration++) {
      field = field.map((_, id) => [0, 1, 2].map((axis) => {
        let mean = 0;
        for (const neighbor of neighbors[id]) mean += field[neighbor][axis];
        mean /= Math.max(1, neighbors[id].size);
        const data = dataWeights[id][axis];
        const smooth = axis === 2 ? 0.6 : 0.4;
        const prior = (axis === 2 ? 0.12 : 0.015) + (1 - confidence[id]) * 0.8;
        return clamp((data * clamp(targets[id][axis], -limits[axis], limits[axis]) + smooth * mean) / (data + smooth + prior), -limits[axis], limits[axis]);
      }));
    }
    return { version: 1, deltas: field.map((delta) => unrotate(delta, camera)), depthConfidence };
  }

  // src/core/fitter.ts
  var fittingLandmarks = [10, 21, 54, 67, 103, 109, 127, 162, 234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397, 288, 361, 323, 454, 356, 389, 251, 284, 332, 297, 338, 33, 133, 159, 145, 263, 362, 386, 374, 70, 63, 105, 66, 107, 336, 296, 334, 293, 300, 1, 2, 4, 5, 6, 98, 327, 168, 195, 61, 291, 0, 17, 13, 14, 78, 308, 50, 280, 101, 330];
  var stableLandmarks = /* @__PURE__ */ new Set([33, 133, 263, 362, 1, 2, 4, 5, 6, 98, 327, 168, 195]);
  var huber = (residual) => residual < 0.025 ? residual * residual / 2 : 0.025 * (residual - 0.0125);
  function localizeLandmarks(points, width, height) {
    const scaled = points.map(([x, y]) => [x * width, y * height]);
    const leftEye = scaled[33], rightEye = scaled[263];
    const angle = Math.atan2(rightEye[1] - leftEye[1], rightEye[0] - leftEye[0]);
    const cosine = Math.cos(angle), sine = Math.sin(angle);
    return scaled.map(([x, y]) => [x * cosine + y * sine, -x * sine + y * cosine]);
  }
  function measureFaceProportions(analysis, template, params, identity) {
    const imageWidth = analysis.maskWidth > 0 ? analysis.maskWidth : 1;
    const imageHeight = analysis.maskHeight > 0 ? analysis.maskHeight : 1;
    const observed = localizeLandmarks(analysis.landmarks, imageWidth, imageHeight);
    const fittedPositions = facePositions(template, params, identity);
    const canonical = localizeLandmarks(fittedPositions, 1, 1);
    const widthAt = (points, a, b) => Math.abs(points[a][0] - points[b][0]);
    const heightAt = (points) => Math.abs(points[152][1] - points[10][1]);
    const safeRatio = (numerator, denominator) => denominator > 1e-6 ? numerator / denominator : 1;
    const scale = (observedRatio, canonicalRatio) => clamp(safeRatio(observedRatio, canonicalRatio), 0.72, 1.28);
    const widths = (points) => ({
      temple: widthAt(points, 127, 356),
      forehead: (widthAt(points, 54, 284) + widthAt(points, 103, 332)) * 0.5,
      cheek: widthAt(points, 234, 454),
      jaw: widthAt(points, 172, 397),
      lowerJaw: widthAt(points, 150, 379),
      chin: widthAt(points, 148, 377)
    });
    const actual = widths(observed), base = widths(canonical);
    const actualTemple = Math.max(actual.temple, 1e-6), baseTemple = Math.max(base.temple, 1e-6);
    const actualCheek = Math.max(actual.cheek, 1e-6);
    return {
      faceAspectRatio: safeRatio(heightAt(observed), actualCheek),
      // Ratios are measured relative to each person's temple width, then
      // normalized against the canonical mesh. 1 means no shape correction.
      foreheadScale: scale(safeRatio(actual.forehead, actualTemple), safeRatio(base.forehead, baseTemple)),
      cheekScale: scale(safeRatio(actual.cheek, actualTemple), safeRatio(base.cheek, baseTemple)),
      jawScale: scale(safeRatio(actual.jaw, actualTemple), safeRatio(base.jaw, baseTemple)),
      lowerJawScale: scale(safeRatio(actual.lowerJaw, actualTemple), safeRatio(base.lowerJaw, baseTemple)),
      chinScale: scale(safeRatio(actual.chin, actualTemple), safeRatio(base.chin, baseTemple))
    };
  }
  function inferHeadGeometry(analysis, template, fittedParams) {
    const { landmarks, maskWidth, maskHeight, hair, skin, bodySkin } = analysis;
    const measurements = measureFaceProportions(analysis, template, fittedParams);
    if (maskWidth < 2 || maskHeight < 2 || hair.length < maskWidth * maskHeight || skin.length < maskWidth * maskHeight) return { params: {}, measurements };
    const faceTop = landmarks[10][1], chinY = landmarks[152][1];
    const faceHeight = chinY - faceTop;
    const faceWidth = Math.abs(landmarks[454][0] - landmarks[234][0]);
    const centerX = (landmarks[33][0] + landmarks[263][0]) * 0.5;
    if (faceHeight < 0.05 || faceWidth < 0.05) return { params: {}, measurements };
    const sample = (mask, x, y) => maskAt(mask, analysis, x, y);
    const neckMask = bodySkin && bodySkin.length >= maskWidth * maskHeight ? bodySkin : skin;
    const headConfidence = (x, y) => Math.max(sample(hair, x, y), sample(skin, x, y), sample(neckMask, x, y));
    const inferred = {};
    const crownOffsets = [-0.08, -0.04, 0, 0.04, 0.08];
    const crownStep = Math.max(1 / maskHeight, faceHeight / 160);
    const crownStart = Math.max(0.015, faceTop - faceHeight * 0.62);
    const crownEnd = faceTop - faceHeight * 0.06;
    const hasCrownSupport = (y) => {
      const values = crownOffsets.map((offset) => headConfidence(centerX + faceWidth * offset, y));
      return values.filter((value) => value > 0.22).length >= 2 && values.reduce((sum, value) => sum + value, 0) / values.length > 0.16;
    };
    let crownTop;
    for (let y = crownStart; y <= crownEnd; y += crownStep) {
      if (y + crownStep * 2 <= crownEnd && hasCrownSupport(y) && hasCrownSupport(y + crownStep) && hasCrownSupport(y + crownStep * 2)) {
        crownTop = y;
        break;
      }
    }
    if (crownTop !== void 0) {
      const crownRatio = (faceTop - crownTop) / faceHeight;
      measurements.crownHeightRatio = crownRatio;
    }
    const extentStep = Math.max(1 / maskWidth, faceWidth / 80);
    const extent = (direction, y, hairAndSkin) => {
      let distance = 0, gap = 0;
      for (let offset = extentStep; offset <= faceWidth * 0.8; offset += extentStep) {
        const x = centerX + direction * offset;
        if (x < 0.01 || x > 0.99) break;
        const confidence = hairAndSkin ? headConfidence(x, y) : sample(neckMask, x, y);
        if (confidence > 0.22) {
          distance = offset;
          gap = 0;
        } else {
          gap += extentStep;
          if (gap > faceWidth * 0.08) break;
        }
      }
      return distance;
    };
    const headWidthRatios = [];
    for (const fraction of [0.04, 0.1, 0.17, 0.24]) {
      const y = faceTop + faceHeight * fraction;
      const left = extent(-1, y, true), right = extent(1, y, true);
      const ratio = (left + right) / faceWidth;
      const hairSupport = Math.max(
        sample(hair, centerX - faceWidth * 0.52, y),
        sample(hair, centerX + faceWidth * 0.52, y)
      );
      if (ratio > 1.04 && hairSupport > 0.16) headWidthRatios.push(ratio);
    }
    if (headWidthRatios.length >= 2) {
      headWidthRatios.sort((a, b) => a - b);
      const middle = Math.floor(headWidthRatios.length / 2);
      const observedRatio = headWidthRatios.length % 2 ? headWidthRatios[middle] : (headWidthRatios[middle - 1] + headWidthRatios[middle]) * 0.5;
      measurements.headWidthToFaceRatio = observedRatio;
      inferred.craniumWidth = clamp((observedRatio - 1.04) / 0.2, -1, 1);
    }
    const neckStart = chinY + faceHeight * 0.035;
    const neckY = chinY + faceHeight * 0.1;
    if (neckY < 0.94 && sample(neckMask, centerX, neckY) > 0.3) {
      const left = extent(-1, neckY, false), right = extent(1, neckY, false);
      const ratio = (left + right) / faceWidth;
      measurements.neckWidthToFaceRatio = ratio;
      if (ratio >= 0.24 && ratio <= 0.9) inferred.neckWidth = clamp((ratio - 0.62) / 0.12, -1, 1);
      if (neckStart < 0.94 && [-0.035, 0, 0.035].every((offset) => sample(neckMask, centerX + faceWidth * offset, neckStart) > 0.22)) {
        let lastSkinY = neckStart, gap = 0;
        const step = Math.max(1 / maskHeight, faceHeight / 160);
        for (let y = neckStart; y < 0.97; y += step) {
          const confidence = [-0.035, 0, 0.035].reduce((sum, offset) => sum + sample(neckMask, centerX + faceWidth * offset, y) / 3, 0);
          if (confidence > 0.24) {
            lastSkinY = y;
            gap = 0;
          } else {
            gap += step;
            if (gap > faceHeight * 0.06) break;
          }
        }
        if (lastSkinY < 0.93) {
          const visibleLength = (lastSkinY - chinY) / faceHeight;
          measurements.neckLengthToFaceRatio = visibleLength;
          if (visibleLength >= 0.2 && visibleLength <= 0.62) {
            inferred.neckLength = clamp((visibleLength - 0.34) / 0.3, -0.65, 0.45);
          }
        }
      }
    }
    inferred.craniumDepth = clamp(0.35 * (inferred.craniumWidth ?? 0), -1, 1);
    return { params: inferred, measurements };
  }
  function fitHead(template, anchors, analysis, options = { occludedEyes: false }) {
    const observed = analysis.landmarks;
    if (observed.length !== 478 || observed.some((point) => point.some((v) => !Number.isFinite(v)))) throw new Error("Landmark kh\xF4ng h\u1EE3p l\u1EC7.");
    const landmarkWeights = landmarkVisibility(analysis, options);
    const depthConfidence = relativeDepthConfidence(analysis);
    const visibleEyes = eyeVisibility(landmarkWeights);
    const byId = new Map(anchors.map((anchor) => [anchor.landmark, anchor]));
    const fitting = fittingLandmarks.map((id) => {
      const anchor = byId.get(id);
      if (!anchor || !template.triangles[anchor.triangle]) throw new Error(`Thi\u1EBFu anchor ${id}.`);
      if (Math.abs(anchor.weights.reduce((a, b) => a + b, 0) - 1) > 1e-6) throw new Error("Barycentric weights kh\xF4ng h\u1EE3p l\u1EC7.");
      return { id, anchor };
    });
    const params = Object.fromEntries(shapeControls.map(([key]) => [key, 0]));
    const expression = {
      jawOpen: clamp(analysis.blendshapes.jawOpen ?? 0, 0, 1),
      smile: clamp(((analysis.blendshapes.mouthSmileLeft ?? 0) + (analysis.blendshapes.mouthSmileRight ?? 0)) / 2, 0, 1),
      blink: clamp(((analysis.blendshapes.eyeBlinkLeft ?? 0) + (analysis.blendshapes.eyeBlinkRight ?? 0)) / 2, 0, 1)
    };
    const expressionPrior = { ...expression };
    const eyeDistance = Math.hypot(observed[263][0] - observed[33][0], observed[263][1] - observed[33][1]);
    if (eyeDistance < 0.05) throw new Error("Hai m\u1EAFt qu\xE1 nh\u1ECF ho\u1EB7c b\u1ECB che. H\xE3y ch\u1ECDn \u1EA3nh r\xF5 h\u01A1n v\xE0 g\u1EA7n ch\xEDnh di\u1EC7n.");
    const width = Math.hypot(template.positions[263][0] - template.positions[33][0], template.positions[263][1] - template.positions[33][1]);
    const camera = {
      rx: 0,
      ry: 0,
      rz: -Math.atan2(observed[263][1] - observed[33][1], observed[263][0] - observed[33][0]),
      scale: eyeDistance / width,
      tx: (observed[33][0] + observed[263][0]) / 2,
      ty: (observed[33][1] + observed[263][1]) / 2 + template.positions[33][1] * eyeDistance / width
    };
    const anchorPosition = (anchor) => {
      const triangle = template.triangles[anchor.triangle];
      const point = [0, 0, 0];
      triangle.forEach((vertex, corner) => {
        const deformed = deformPoint(template.positions[vertex], template.parts[vertex], params, expression);
        for (let axis = 0; axis < 3; axis++) point[axis] += deformed[axis] * anchor.weights[corner];
      });
      return point;
    };
    const loss = () => {
      let value = 0, weights = 0;
      const samples = [];
      for (const { id, anchor } of fitting) {
        const posed = rotate(anchorPosition(anchor), camera);
        const projected2 = [camera.tx + posed[0] * camera.scale, camera.ty - posed[1] * camera.scale];
        const weight = (stableLandmarks.has(id) ? 2 : id === 13 || id === 14 ? 0.35 : 1) * landmarkWeights[id];
        const dx = (projected2[0] - observed[id][0]) / eyeDistance;
        const dy = (projected2[1] - observed[id][1]) / eyeDistance;
        value += weight * huber(Math.hypot(dx, dy));
        weights += weight;
        samples.push({ z: posed[2] * camera.scale / eyeDistance, observedZ: -observed[id][2] / eyeDistance, weight });
      }
      const depthOrigin = samples.reduce((sum, sample) => sum + sample.weight * (sample.z - sample.observedZ), 0) / weights;
      for (const sample of samples) value += 0.18 * depthConfidence * sample.weight * huber(Math.abs(sample.z - sample.observedZ - depthOrigin));
      const prior = Object.values(params).reduce((sum, p) => sum + p * p, 0) * 25e-6;
      const expressionLoss = Object.entries(expression).reduce((sum, [key, p]) => sum + (p - expressionPrior[key]) ** 2, 0) * 2e-4;
      return value / weights + prior + expressionLoss;
    };
    let best = loss(), iterations = 0;
    const optimize = (object, key, step, min, max) => {
      const original = object[key];
      let picked = original;
      for (const direction of [-1, 1]) {
        object[key] = clamp(original + direction * step, min, max);
        const candidate = loss();
        if (candidate < best) {
          best = candidate;
          picked = object[key];
        }
      }
      object[key] = picked;
    };
    let stale = 0;
    for (let round = 0; round < 16; round++) {
      const before = best;
      const decay = round < 4 ? 1 : round < 10 ? 0.45 : 0.18;
      for (let repeat = 0; repeat < 2; repeat++) {
        optimize(camera, "tx", eyeDistance * 0.02 * decay, -1, 2);
        optimize(camera, "ty", eyeDistance * 0.02 * decay, -1, 2);
        optimize(camera, "scale", eyeDistance / width * 0.025 * decay, 1e-3, 0.2);
        for (const key of ["rx", "ry", "rz"]) optimize(camera, key, 0.035 * decay, -0.75, 0.75);
      }
      for (const [key] of shapeControls) {
        if (key.startsWith("ear")) continue;
        if (visibleEyes < 0.45 && ["eyeSize", "eyeOpening", "eyeTilt"].includes(key)) continue;
        optimize(params, key, 0.15 * decay, -1, 1);
      }
      for (const key of Object.keys(expression)) optimize(expression, key, 0.1 * decay, 0, 1);
      iterations++;
      stale = before - best < 1e-9 ? stale + 1 : 0;
      if (stale >= 4) break;
    }
    const inferred = inferHeadGeometry(analysis, template, params);
    Object.assign(params, inferred.params);
    const error = (points) => {
      const squared = fitting.reduce((sum, { id }) => sum + landmarkWeights[id] * ((points[id][0] - observed[id][0]) ** 2 + (points[id][1] - observed[id][1]) ** 2), 0);
      return Math.sqrt(squared / fitting.reduce((sum, { id }) => sum + landmarkWeights[id], 0)) / eyeDistance;
    };
    const coarseNormalizedError = error(facePositions(template, params, void 0, expression).map((point) => project(point, camera)));
    const identity = fitFaceIdentity(template, analysis, params, expression, camera, landmarkWeights);
    const projected = facePositions(template, params, identity, expression).map((point) => project(point, camera));
    const normalizedError = error(projected);
    const measurements = { ...inferred.measurements, ...measureFaceProportions(analysis, template, params, identity) };
    const warnings = [];
    if (visibleEyes < 0.45) warnings.push("V\xF9ng m\u1EAFt b\u1ECB che ho\u1EB7c \u0111\u01B0\u1EE3c \u0111\xE1nh d\u1EA5u c\xF3 k\xEDnh: gi\u1EEF h\xECnh m\u1EAFt m\u1EABu, c\xF3 th\u1EC3 ch\u1EC9nh \u0111\u1ED9 m\u1EDF/nghi\xEAng m\u1EAFt.");
    if (fitting.filter(({ id }) => landmarkWeights[id] < 0.4).length > 5) warnings.push("\u0110\xE3 gi\u1EA3m \u1EA3nh h\u01B0\u1EDFng c\u1EE7a v\xF9ng c\xF3 t\xF3c/ph\u1EE5 ki\u1EC7n l\xEAn h\xECnh h\u1ECDc; ph\u1EA7n b\u1ECB che d\xF9ng h\xECnh d\u1EA1ng m\u1EABu.");
    if (Math.abs(camera.ry) > 0.35 || Math.abs(camera.rx) > 0.35) warnings.push("\u1EA2nh nghi\xEAng nhi\u1EC1u: v\xF9ng khu\u1EA5t d\xF9ng h\xECnh d\u1EA1ng m\u1EABu. N\xEAn th\u1EED \u1EA3nh g\u1EA7n ch\xEDnh di\u1EC7n.");
    if (expression.jawOpen > 0.25) warnings.push("Mi\u1EC7ng m\u1EDF: \u0111\u1EA7u xu\u1EA5t v\u1EC1 tr\u1EA1ng th\xE1i trung t\xEDnh; texture m\xF4i c\xF3 th\u1EC3 c\xF2n bi\u1EC3u c\u1EA3m.");
    if (expression.smile > 0.35) warnings.push("\u1EA2nh \u0111ang c\u01B0\u1EDDi: \u0111\xE3 gi\u1EA3m hi\u1EC7u ch\u1EC9nh v\xF9ng mi\u1EC7ng; h\xECnh m\xF4i v\xE0 texture trung t\xEDnh v\u1EABn ch\u1EC9 l\xE0 \u01B0\u1EDBc l\u01B0\u1EE3ng.");
    if (normalizedError > 0.08) warnings.push("Sai s\u1ED1 kh\u1EDBp c\xF2n cao. Th\u1EED crop s\xE1t m\u1EB7t, \u1EA3nh th\u1EB3ng ho\u1EB7c ch\u1EC9nh c\xE1c thanh h\xECnh h\u1ECDc.");
    if (identity.depthConfidence < 0.25) warnings.push("Chi\u1EC1u s\xE2u landmark thi\u1EBFu tin c\u1EADy: h\xECnh m\u0169i/m\xE1 d\u1EF1a nhi\u1EC1u v\xE0o m\u1EABu.");
    return { params, identity, measurements, expression, camera, projected, normalizedError, coarseNormalizedError, iterations, landmarkWeights, warnings };
  }

  // src/core/skin.ts
  function srgbToLinear(value) {
    const color = clamp(value / 255, 0, 1);
    return color <= 0.04045 ? color / 12.92 : ((color + 0.055) / 1.055) ** 2.4;
  }
  function linearToSrgb(value) {
    const color = clamp(value, 0, 1);
    return 255 * (color <= 31308e-7 ? color * 12.92 : 1.055 * color ** (1 / 2.4) - 0.055);
  }
  function createSkinField(skin, samples, params) {
    const base = skin.map(srgbToLinear);
    const light = (color) => color[0] * 0.2126 + color[1] * 0.7152 + color[2] * 0.0722;
    const baseLight = Math.max(1e-6, light(base));
    const spatialSamples = samples.map((sample) => ({
      region: sample.region,
      position: deformPoint(sample.position, "face", params),
      color: sample.color.map(srgbToLinear)
    })).filter((sample) => light(sample.color) >= baseLight * 0.45 && light(sample.color) <= baseLight * 1.65);
    const averageColor = (regionSamples) => {
      if (!regionSamples.length) return [...base];
      return [0, 1, 2].map(
        (channel) => regionSamples.reduce((sum, sample) => sum + sample.color[channel], 0) / regionSamples.length
      );
    };
    const leftSamples = spatialSamples.filter((sample) => sample.region === "left-cheek" || sample.region === "left-temple");
    const rightSamples = spatialSamples.filter((sample) => sample.region === "right-cheek" || sample.region === "right-temple");
    const foreheadSamples = spatialSamples.filter((sample) => sample.region === "forehead");
    const jawSamples = spatialSamples.filter((sample) => sample.region === "jaw");
    const leftColor = averageColor(leftSamples), rightColor = averageColor(rightSamples);
    const foreheadColor = averageColor(foreheadSamples), jawColor = averageColor(jawSamples);
    const faceHalfWidth = Math.max(7.7, ...spatialSamples.map((sample) => Math.abs(sample.position[0])));
    const foreheadY = foreheadSamples.length ? foreheadSamples.reduce((sum, sample) => sum + sample.position[1], 0) / foreheadSamples.length : 7;
    const jawY = jawSamples.length ? jawSamples.reduce((sum, sample) => sum + sample.position[1], 0) / jawSamples.length : -8;
    const smoothstep2 = (value) => {
      const t = clamp(value, 0, 1);
      return t * t * (3 - 2 * t);
    };
    return (point) => {
      if (!spatialSamples.length) return [...base];
      const sideMix = smoothstep2(0.5 + point[0] / (faceHalfWidth * 2));
      const sideColor = leftColor.map((value, channel) => value * (1 - sideMix) + rightColor[channel] * sideMix);
      let regional = base.map((value, channel) => value * 0.88 + sideColor[channel] * 0.12);
      const crownMix = smoothstep2((point[1] - foreheadY - 0.3) / (faceHalfWidth * 0.55)) * 0.55;
      regional = regional.map((value, channel) => value * (1 - crownMix) + foreheadColor[channel] * crownMix);
      const neckMix = smoothstep2((-point[1] + jawY - 0.3) / (faceHalfWidth * 0.55)) * 0.35;
      regional = regional.map((value, channel) => value * (1 - neckMix) + jawColor[channel] * neckMix);
      const weighted = [0, 0, 0];
      let totalWeight = 0, nearest = Infinity;
      for (const sample of spatialSamples) {
        const distanceSquared = point.reduce((sum, value, axis) => sum + (value - sample.position[axis]) ** 2, 0);
        nearest = Math.min(nearest, distanceSquared);
        const weight = 1 / (distanceSquared + 4) ** 2;
        totalWeight += weight;
        for (let channel = 0; channel < 3; channel++) weighted[channel] += sample.color[channel] * weight;
      }
      const local = 0.12 * Math.exp(-nearest / 16);
      return weighted.map((value, channel) => regional[channel] * (1 - local) + value / totalWeight * local);
    };
  }

  // src/core/subdivision.ts
  function smoothHeadSurface(head, passes = 3) {
    return smoothHeadSurfaceFields(head, [], passes).surface;
  }
  function smoothHeadSurfaceFields(head, fields, passes = 3) {
    let surface = head;
    let subdividedFields = fields;
    const edgeKey = (a, b) => a < b ? `${a}:${b}` : `${b}:${a}`;
    for (let pass = 0; pass < passes; pass++) {
      const neighbors = surface.positions.map(() => /* @__PURE__ */ new Set());
      const edges = /* @__PURE__ */ new Map();
      for (const triangle of surface.triangles) for (let corner = 0; corner < 3; corner++) {
        const a = triangle[corner], b = triangle[(corner + 1) % 3], opposite = triangle[(corner + 2) % 3];
        neighbors[a].add(b);
        neighbors[b].add(a);
        const key = edgeKey(a, b);
        const edge = edges.get(key);
        if (edge) edge.opposite.push(opposite);
        else edges.set(key, { a, b, opposite: [opposite], vertex: -1 });
      }
      const openNeighbors = surface.positions.map(() => []);
      for (const { a, b, opposite } of edges.values()) if (opposite.length === 1) {
        openNeighbors[a].push(b);
        openNeighbors[b].push(a);
      }
      const smoothVertex = (values, index) => {
        const point = values[index];
        if (neighbors[index].size < 2) return [...point];
        const open = openNeighbors[index];
        const adjacent = open.length === 2 ? open : [...neighbors[index]];
        const count = adjacent.length;
        const beta = open.length === 2 ? 1 / 8 : (5 / 8 - (3 / 8 + Math.cos(2 * Math.PI / count) / 4) ** 2) / count;
        return point.map((value, axis) => {
          let total = 0;
          for (const id of adjacent) total += values[id][axis];
          const smooth = value * (1 - count * beta) + total * beta;
          const retain = surface.detailWeights?.[index] ?? 0;
          return smooth + (value - smooth) * retain;
        });
      };
      let nextVertex = surface.positions.length;
      for (const edge of edges.values()) edge.vertex = nextVertex++;
      const subdivideValues = (values) => {
        const result = values.map((_, index) => smoothVertex(values, index));
        for (const { a, b, opposite } of edges.values()) {
          const smoothEdge = values[a].map((value, axis) => {
            if (opposite.length !== 2) return (value + values[b][axis]) * 0.5;
            return 0.375 * (value + values[b][axis]) + 0.125 * (values[opposite[0]][axis] + values[opposite[1]][axis]);
          });
          result.push(smoothEdge);
        }
        return result;
      };
      const positions = subdivideValues(surface.positions);
      subdividedFields = subdividedFields.map(subdivideValues);
      const photoPoints = surface.photoPoints ? subdivideValues(surface.photoPoints) : void 0;
      const parts = [...surface.parts], uv = [...surface.uv], skinFade = [...surface.skinFade];
      const detailWeights = surface.detailWeights ? [...surface.detailWeights] : void 0;
      for (const { a, b } of edges.values()) {
        parts.push(surface.parts[a] === surface.parts[b] ? surface.parts[a] : "bridge");
        uv.push([(surface.uv[a][0] + surface.uv[b][0]) * 0.5, (surface.uv[a][1] + surface.uv[b][1]) * 0.5]);
        skinFade.push((surface.skinFade[a] + surface.skinFade[b]) * 0.5);
        detailWeights?.push((surface.detailWeights[a] + surface.detailWeights[b]) * 0.5);
      }
      const triangles = [];
      for (const [a, b, c] of surface.triangles) {
        const ab = edges.get(edgeKey(a, b)).vertex;
        const bc = edges.get(edgeKey(b, c)).vertex;
        const ca = edges.get(edgeKey(c, a)).vertex;
        triangles.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]);
      }
      const mouthRim = surface.mouthRim?.flatMap((id, i, rim) => [id, edges.get(edgeKey(id, rim[(i + 1) % rim.length])).vertex]);
      const neckRim = surface.neckRim?.flatMap((id, i, rim) => [id, edges.get(edgeKey(id, rim[(i + 1) % rim.length])).vertex]);
      surface = { positions, parts, uv, triangles, skinFade, photoPoints, detailWeights, mouthRim, neckRim, faceTriangleCount: surface.faceTriangleCount * 4 };
    }
    return { surface, fields: subdividedFields };
  }

  // src/core/mouth.ts
  var upperLipRim = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308];
  var lowerLipRim = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308];
  var innerLip = /* @__PURE__ */ new Set([...upperLipRim, ...lowerLipRim]);
  function mouthSurfaceTriangles(triangles) {
    return triangles.filter((triangle) => !triangle.every((id) => innerLip.has(id)));
  }

  // src/core/appearance.ts
  var luma = ([r, g, b]) => r * 0.2126 + g * 0.7152 + b * 0.0722;
  var median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  function sampleSkinColor(analysis, pixels, width, height) {
    const samples = [];
    const faceWidth = Math.abs(analysis.landmarks[454][0] - analysis.landmarks[234][0]);
    const radius = Math.max(2, Math.round(faceWidth * width * 0.025));
    const add = (x, y) => {
      if (x < 0 || y < 0 || x >= width || y >= height) return;
      const u = x / width, v = y / height;
      if (maskAt(analysis.skin, analysis, u, v) < 0.72 || maskAt(analysis.hair, analysis, u, v) > 0.12 || maskAt(analysis.accessories, analysis, u, v) > 0.12) return;
      const index = (Math.floor(y) * width + Math.floor(x)) * 4;
      const color = [pixels[index], pixels[index + 1], pixels[index + 2]];
      if (luma(color) > 18 && luma(color) < 244 && Math.max(...color) < 253) samples.push(color);
    };
    for (const id of [50, 101, 205, 206, 207, 280, 330, 425, 426, 427, 18]) {
      const [u, v] = analysis.landmarks[id];
      const step = Math.max(1, Math.round(radius / 3));
      for (let dy = -radius; dy <= radius; dy += step) for (let dx = -radius; dx <= radius; dx += step) add(u * width + dx, v * height + dy);
    }
    if (samples.length < 16) {
      const top = analysis.landmarks[2][1], bottom = analysis.landmarks[152][1];
      const left = Math.min(analysis.landmarks[234][0], analysis.landmarks[454][0]);
      const right = Math.max(analysis.landmarks[234][0], analysis.landmarks[454][0]);
      for (let y = top * height; y < bottom * height; y += 5) for (let x = left * width; x < right * width; x += 5) add(x, y);
    }
    if (samples.length < 8) return { color: [197, 159, 137], warning: "Kh\xF4ng l\u1EA5y \u0111\u01B0\u1EE3c \u0111\u1EE7 v\xF9ng da r\xF5. \u0110ang d\xF9ng m\xE0u da m\u1EABu; c\xF3 th\u1EC3 ch\u1EC9nh m\xE0u b\xEAn d\u01B0\u1EDBi." };
    const center = median(samples.map(luma));
    const diffuse = samples.filter((color) => Math.abs(luma(color) - center) < Math.max(12, center * 0.22));
    const accepted = diffuse.length >= 8 ? diffuse : samples;
    return { color: [0, 1, 2].map((channel) => Math.round(median(accepted.map((color) => color[channel])))) };
  }

  // src/core/texture.ts
  function raster(points, width, height, visit) {
    const [[ax, ay], [bx, by], [cx, cy]] = points;
    const denominator = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(denominator) < 1e-8) return;
    const left = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
    const right = Math.min(width - 1, Math.ceil(Math.max(ax, bx, cx)));
    const top = Math.max(0, Math.floor(Math.min(ay, by, cy)));
    const bottom = Math.min(height - 1, Math.ceil(Math.max(ay, by, cy)));
    for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
      const a = ((by - cy) * (x + 0.5 - cx) + (cx - bx) * (y + 0.5 - cy)) / denominator;
      const b = ((cy - ay) * (x + 0.5 - cx) + (ax - cx) * (y + 0.5 - cy)) / denominator;
      const c = 1 - a - b;
      if (a >= -1e-5 && b >= -1e-5 && c >= -1e-5) visit(x, y, a, b, c);
    }
  }
  function bilinear(array, width, height, x, y, channels = 1, channel = 0) {
    x = clamp(x, 0, width - 1);
    y = clamp(y, 0, height - 1);
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const at = (px, py) => array[(Math.min(py, height - 1) * width + Math.min(px, width - 1)) * channels + channel];
    return (at(ix, iy) * (1 - fx) + at(ix + 1, iy) * fx) * (1 - fy) + (at(ix, iy + 1) * (1 - fx) + at(ix + 1, iy + 1) * fx) * fy;
  }
  function trimmedMean(values, trim = 0.1) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const trimCount = Math.floor(sorted.length * trim);
    const retained = sorted.slice(trimCount, Math.max(trimCount + 1, sorted.length - trimCount));
    return retained.reduce((sum, value) => sum + value, 0) / retained.length;
  }
  var luminance = (r, g, b) => r * 0.2126 + g * 0.7152 + b * 0.0722;
  var feather = (low, high, value) => {
    const t = clamp((value - low) / (high - low), 0, 1);
    return t * t * (3 - 2 * t);
  };
  function depthVisibility(depth, size, x, y, z) {
    x = clamp(x - 0.5, 0, size - 1);
    y = clamp(y - 0.5, 0, size - 1);
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const at = (px, py) => 1 - feather(0.15, 0.65, depth[Math.min(py, size - 1) * size + Math.min(px, size - 1)] - z);
    return (at(ix, iy) * (1 - fx) + at(ix + 1, iy) * fx) * (1 - fy) + (at(ix, iy + 1) * (1 - fx) + at(ix + 1, iy + 1) * fx) * fy;
  }
  function boundaryDistance(point, boundary) {
    let distance = Infinity;
    boundary.forEach((a, index) => {
      const b = boundary[(index + 1) % boundary.length];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const t = clamp(((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / Math.max(1e-12, dx * dx + dy * dy), 0, 1);
      distance = Math.min(distance, Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dy));
    });
    return distance;
  }
  function buildFeatureMask(analysis, width, height, eyeDistance) {
    const size = 512, mask = new Float32Array(size * size);
    const featherWidth = eyeDistance * 0.035;
    const contours = [
      ...[...eyeContours, ...browContours].map(({ upper, lower }) => ({
        polygon: [...upper, ...[...lower].reverse()].map((id) => [analysis.landmarks[id][0] * width, analysis.landmarks[id][1] * height]),
        featherWidth
      })),
      { polygon: outerLip.map((id) => [analysis.landmarks[id][0] * width, analysis.landmarks[id][1] * height]), featherWidth },
      // Keep the actual skin between lash and surrounding lid landmarks. This
      // preserves visible folds (or their absence) without guessing a crease
      // height, drawing one, or darkening every upper eyelid alike.
      ...eyeContours.map(({ upper, lid }) => ({
        polygon: [...lid, ...[...upper].reverse()].map((id) => [analysis.landmarks[id][0] * width, analysis.landmarks[id][1] * height]),
        featherWidth: eyeDistance * 0.018
      }))
    ];
    for (const { polygon, featherWidth: contourFeather } of contours) {
      const left = Math.max(0, Math.floor((Math.min(...polygon.map((point) => point[0])) - contourFeather) / width * size));
      const right = Math.min(size - 1, Math.ceil((Math.max(...polygon.map((point) => point[0])) + contourFeather) / width * size));
      const top = Math.max(0, Math.floor((Math.min(...polygon.map((point) => point[1])) - contourFeather) / height * size));
      const bottom = Math.min(size - 1, Math.ceil((Math.max(...polygon.map((point) => point[1])) + contourFeather) / height * size));
      for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
        const px = (x + 0.5) / size * width, py = (y + 0.5) / size * height;
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
          const a = polygon[i], b = polygon[j];
          if (a[1] > py !== b[1] > py && px < (b[0] - a[0]) * (py - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
        }
        const weight = inside ? 1 : 1 - feather(0, contourFeather, boundaryDistance([px, py], polygon));
        const index = y * size + x;
        mask[index] = Math.max(mask[index], weight);
      }
    }
    return { mask, size };
  }
  function surfaceBoundaryLoop(triangles, startHint) {
    const edges = /* @__PURE__ */ new Map();
    for (const [a, b, c] of triangles) for (const [from, to] of [[a, b], [b, c], [c, a]]) {
      const key = from < to ? `${from}:${to}` : `${to}:${from}`;
      const edge = edges.get(key);
      if (edge) edge.count++;
      else edges.set(key, { a: from, b: to, count: 1 });
    }
    const adjacent = /* @__PURE__ */ new Map();
    for (const { a, b, count } of edges.values()) {
      if (count !== 1) continue;
      adjacent.set(a, [...adjacent.get(a) ?? [], b]);
      adjacent.set(b, [...adjacent.get(b) ?? [], a]);
    }
    const first = adjacent.get(startHint);
    if (!first?.length) return [];
    const loop = [startHint];
    let previous = startHint, current = first[0];
    while (current !== startHint && loop.length <= adjacent.size) {
      loop.push(current);
      const next = (adjacent.get(current) ?? []).find((id) => id !== previous);
      if (next === void 0) return [];
      previous = current;
      current = next;
    }
    return current === startHint ? loop : [];
  }
  function photoColorLayer(pixels, width, height, faceDistance, fallback) {
    const size = 128, layer = new Float32Array(size * size * 4);
    const maskSize = Math.sqrt(faceDistance.length);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const offset = (y * size + x) * 4;
      for (const dy of [-0.3, 0, 0.3]) for (const dx of [-0.3, 0, 0.3]) {
        const u = (x + 0.5 + dx) / size, v = (y + 0.5 + dy) / size;
        const distance = bilinear(faceDistance, maskSize, maskSize, u * maskSize - 0.5, v * maskSize - 0.5);
        const weight = feather(0, 3, distance) / 9;
        for (let channel = 0; channel < 3; channel++) layer[offset + channel] += srgbToLinear(bilinear(pixels, width, height, u * width, v * height, 4, channel)) * weight;
        layer[offset + 3] += weight;
      }
    }
    const kernel = [1, 4, 6, 4, 1];
    let source = layer;
    for (const vertical of [false, true]) {
      const filtered = new Float32Array(layer.length);
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) for (let channel = 0; channel < 4; channel++) {
        for (let tap = 0; tap < kernel.length; tap++) {
          const px = vertical ? x : clamp(x + tap - 2, 0, size - 1);
          const py = vertical ? clamp(y + tap - 2, 0, size - 1) : y;
          filtered[(y * size + x) * 4 + channel] += source[(py * size + px) * 4 + channel] * kernel[tap] / 16;
        }
      }
      source = filtered;
    }
    for (let offset = 0; offset < source.length; offset += 4) for (let channel = 0; channel < 3; channel++) {
      source[offset + channel] = source[offset + 3] > 1e-5 ? source[offset + channel] / source[offset + 3] : srgbToLinear(fallback[channel]);
    }
    return { pixels: source, size };
  }
  function padAtlas(atlas, covered, size) {
    let frontier = [];
    const neighbors = (index) => [
      index % size > 0 ? index - 1 : -1,
      index % size < size - 1 ? index + 1 : -1,
      index >= size ? index - size : -1,
      index < size * (size - 1) ? index + size : -1
    ];
    for (let index = 0; index < covered.length; index++) {
      if (!covered[index]) continue;
      if (index % size > 0 && !covered[index - 1] || index % size < size - 1 && !covered[index + 1] || index >= size && !covered[index - size] || index < size * (size - 1) && !covered[index + size]) frontier.push(index);
    }
    for (let pass = 0; pass < 6 && frontier.length; pass++) {
      const nextFrontier = [];
      for (const index of frontier) for (const next of neighbors(index)) {
        if (next < 0 || covered[next]) continue;
        for (let channel = 0; channel < 3; channel++) atlas[next * 4 + channel] = atlas[index * 4 + channel];
        covered[next] = 1;
        nextFrontier.push(next);
      }
      frontier = nextFrontier;
    }
  }
  function buildRearSkinMap(pixels, imageWidth, imageHeight, foreheadRect, size, base, skinSamples) {
    const rectWidth = Math.max(1, foreheadRect.right - foreheadRect.left);
    const rectHeight = Math.max(1, foreheadRect.bottom - foreheadRect.top);
    const patchSide = clamp(Math.round(Math.min(rectWidth, rectHeight) * 0.72), 32, Math.min(imageWidth - 2, imageHeight - 2));
    const centerX = (foreheadRect.left + foreheadRect.right) * 0.5;
    const centerY = (foreheadRect.top + foreheadRect.bottom) * 0.5;
    const left = clamp(centerX - patchSide * 0.5, 0, imageWidth - patchSide);
    const top = clamp(centerY - patchSide * 0.5, 0, imageHeight - patchSide);
    const patchSize = Math.max(32, Math.ceil(patchSide));
    const patch = new Float32Array(patchSize * patchSize * 4);
    for (let y = 0; y < patchSize; y++) for (let x = 0; x < patchSize; x++) {
      const sourceX = left + patchSide * (x + 0.5) / patchSize;
      const sourceY = top + patchSide * (y + 0.5) / patchSize;
      const offset = (y * patchSize + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        patch[offset + channel] = srgbToLinear(bilinear(pixels, imageWidth, imageHeight, sourceX, sourceY, 4, channel));
      }
      patch[offset + 3] = 1;
    }
    const averageRegion = (regions) => {
      const samples = skinSamples.filter((sample) => regions.includes(sample.region));
      if (!samples.length) return [...base];
      return [0, 1, 2].map((channel) => base[channel] * 0.88 + 0.12 * samples.reduce(
        (sum, sample) => sum + srgbToLinear(sample.color[channel]),
        0
      ) / samples.length);
    };
    const foreheadTone = averageRegion(["forehead"]);
    const templeTone = averageRegion(["left-temple", "right-temple"]);
    const cheekTone = averageRegion(["left-cheek", "right-cheek"]);
    const jawTone = averageRegion(["jaw"]);
    const smooth = (low, high, value) => {
      const t = clamp((value - low) / (high - low), 0, 1);
      return t * t * (3 - 2 * t);
    };
    const mixColor = (a, b, weight) => a.map((value, channel) => value * (1 - weight) + b[channel] * weight);
    const toneAt = (u, v) => {
      let front = mixColor(jawTone, cheekTone, smooth(0.2, 0.48, v));
      front = mixColor(front, foreheadTone, smooth(0.62, 0.82, v));
      let side = mixColor(jawTone, cheekTone, smooth(0.2, 0.44, v));
      side = mixColor(side, templeTone, smooth(0.42, 0.68, v));
      side = mixColor(side, foreheadTone, smooth(0.74, 0.92, v) * 0.25);
      const frontness = smooth(0, 1, clamp(1 - Math.abs(u - 0.5) * 4, 0, 1));
      return mixColor(side, front, frontness);
    };
    const reflect = (coordinate, length) => {
      const period = length * 2;
      const wrapped = (coordinate % period + period) % period;
      return wrapped < length ? wrapped : period - 1 - wrapped;
    };
    const blurRadius = clamp(Math.round(patchSize * 0.1), 3, 8);
    const windowSize = blurRadius * 2 + 1;
    const horizontal = new Float32Array(patch.length), blurred = new Float32Array(patch.length);
    for (let y = 0; y < patchSize; y++) for (let x = 0; x < patchSize; x++) for (let channel = 0; channel < 3; channel++) {
      let sum = 0;
      for (let tap = -blurRadius; tap <= blurRadius; tap++) sum += patch[(y * patchSize + reflect(x + tap, patchSize)) * 4 + channel];
      horizontal[(y * patchSize + x) * 4 + channel] = sum / windowSize;
    }
    for (let y = 0; y < patchSize; y++) for (let x = 0; x < patchSize; x++) for (let channel = 0; channel < 3; channel++) {
      let sum = 0;
      for (let tap = -blurRadius; tap <= blurRadius; tap++) sum += horizontal[(reflect(y + tap, patchSize) * patchSize + x) * 4 + channel];
      blurred[(y * patchSize + x) * 4 + channel] = sum / windowSize;
    }
    const rearSkinMap = new Float32Array(size * size * 4);
    const repeatsX = 1;
    const repeatsY = 1;
    const tileWidth = size / repeatsX, tileHeight = size / repeatsY;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const tileX = Math.floor(x / tileWidth), tileY = Math.floor(y / tileHeight);
      const localX = (x + 0.5 - tileX * tileWidth) / tileWidth;
      const localY = (y + 0.5 - tileY * tileHeight) / tileHeight;
      const sampleX = tileX % 2 === 0 ? localX : 1 - localX;
      const sampleY = tileY % 2 === 0 ? localY : 1 - localY;
      const targetOffset = (y * size + x) * 4;
      const regionalTone = toneAt((x + 0.5) / size, 1 - (y + 0.5) / size);
      for (let channel = 0; channel < 3; channel++) {
        const sample = bilinear(patch, patchSize, patchSize, sampleX * patchSize - 0.5, sampleY * patchSize - 0.5, 4, channel);
        const lowFrequency = bilinear(blurred, patchSize, patchSize, sampleX * patchSize - 0.5, sampleY * patchSize - 0.5, 4, channel);
        const detail = clamp(sample - lowFrequency, -0.012, 0.012);
        rearSkinMap[targetOffset + channel] = clamp(regionalTone[channel] + detail * 0.12, 0, 1);
      }
      rearSkinMap[targetOffset + 3] = 1;
    }
    const original = rearSkinMap.slice();
    const blendWidth = Math.max(8, Math.round(size * 0.045));
    for (let y = 0; y < size; y++) for (let x = 0; x < blendWidth; x++) {
      const t = x / blendWidth, weight = t * t * (3 - 2 * t);
      const leftOffset = (y * size + x) * 4;
      const rightOffset = (y * size + size - 1 - x) * 4;
      const leftInner = (y * size + blendWidth) * 4;
      const rightInner = (y * size + size - 1 - blendWidth) * 4;
      for (let channel = 0; channel < 3; channel++) {
        const edgeColor = (original[leftOffset + channel] + original[rightOffset + channel]) * 0.5;
        rearSkinMap[leftOffset + channel] = edgeColor * (1 - weight) + original[leftInner + channel] * weight;
        rearSkinMap[rightOffset + channel] = edgeColor * (1 - weight) + original[rightInner + channel] * weight;
      }
    }
    return rearSkinMap;
  }
  function buildExtendedSkinMap(size, base, isClean, sample, extensionRadius = 64) {
    const map = new Float32Array(size * size * 4);
    const distance = new Int16Array(size * size).fill(-1);
    const queue = new Int32Array(size * size);
    let queueEnd = 0;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size, v = (y + 0.5) / size;
      const offset = (y * size + x) * 4;
      const clean = isClean(u, v);
      const color = clean ? sample(u, v) : base;
      map[offset] = color[0];
      map[offset + 1] = color[1];
      map[offset + 2] = color[2];
      map[offset + 3] = 1;
      if (!clean) continue;
      const index = y * size + x;
      distance[index] = 0;
      queue[queueEnd++] = index;
    }
    for (let read = 0; read < queueEnd; read++) {
      const index = queue[read], depth = distance[index];
      if (depth >= extensionRadius) continue;
      const x = index % size, y = Math.floor(index / size);
      const neighbors = [
        x > 0 ? index - 1 : -1,
        x + 1 < size ? index + 1 : -1,
        y > 0 ? index - size : -1,
        y + 1 < size ? index + size : -1
      ];
      for (const next of neighbors) {
        if (next < 0 || distance[next] >= 0) continue;
        distance[next] = depth + 1;
        map.set(map.subarray(index * 4, index * 4 + 4), next * 4);
        queue[queueEnd++] = next;
      }
    }
    for (let index = 0; index < distance.length; index++) {
      const depth = distance[index];
      if (depth < 0) continue;
      const t = clamp((depth - 1) / (extensionRadius - 1), 0, 1);
      const fade = 1 - t * t * (3 - 2 * t);
      const offset = index * 4;
      for (let channel = 0; channel < 3; channel++) map[offset + channel] = map[offset + channel] * fade + base[channel] * (1 - fade);
    }
    return { map, distance };
  }
  function buildTexture(template, fit, analysis, pixels, width, height, size = 1024) {
    const mask = (values, x, y) => bilinear(values, analysis.maskWidth, analysis.maskHeight, x / width * analysis.maskWidth, y / height * analysis.maskHeight);
    const photo = (x, y, channel) => bilinear(pixels, width, height, x, y, 4, channel);
    const pixelSkinSamples = [];
    const regions = [50, 101, 117, 118, 205, 280, 330, 346, 347, 425, 4, 127, 234, 356, 454, 108, 337, 67, 297];
    const eyeDistance = Math.hypot(
      (analysis.landmarks[33][0] - analysis.landmarks[263][0]) * width,
      (analysis.landmarks[33][1] - analysis.landmarks[263][1]) * height
    );
    const frontalCenterX = (analysis.landmarks[33][0] + analysis.landmarks[263][0]) * width * 0.5;
    const frontalSampleHalfWidth = eyeDistance * 1.3;
    const sampleRadius = clamp(Math.round(eyeDistance * 0.09), 5, 18);
    const confidenceSize = 256, sourceDistance = new Float32Array(confidenceSize * confidenceSize);
    const outsideDistance = new Float32Array(sourceDistance.length);
    const outline = template.boundary.map((id) => analysis.landmarks[id]);
    const browY = Math.min(analysis.landmarks[70][1], analysis.landmarks[300][1]);
    const eyeLeft = Math.min(analysis.landmarks[33][0], analysis.landmarks[263][0]) * width - eyeDistance * 0.12;
    const eyeRight = Math.max(analysis.landmarks[33][0], analysis.landmarks[263][0]) * width + eyeDistance * 0.12;
    const eyeTop = browY * height - eyeDistance * 0.12;
    const eyeBottom = Math.max(analysis.landmarks[145][1], analysis.landmarks[374][1]) * height + eyeDistance * 0.12;
    const inEyeSampling = (x, y) => x >= eyeLeft && x <= eyeRight && y >= eyeTop && y <= eyeBottom;
    const eyewearLeft = Math.min(analysis.landmarks[70][0] * width, eyeLeft) - eyeDistance * 0.18;
    const eyewearRight = Math.max(analysis.landmarks[300][0] * width, eyeRight) + eyeDistance * 0.18;
    const eyewearTop = Math.max(eyeTop, browY * height - eyeDistance * 0.02);
    const eyewearBottom = Math.max(eyeBottom, ...[117, 118, 346, 347].map((id) => analysis.landmarks[id][1] * height)) + eyeDistance * 0.18;
    const inEyewear = (x, y) => x >= eyewearLeft && x <= eyewearRight && y >= eyewearTop && y <= eyewearBottom;
    const eyeDetails = [[33, 133, 145, 70], [263, 362, 374, 300]].map(([outer, inner, lower, brow]) => ({
      x: (analysis.landmarks[outer][0] + analysis.landmarks[inner][0]) * width * 0.5,
      y: (analysis.landmarks[brow][1] + analysis.landmarks[lower][1]) * height * 0.5,
      rx: Math.abs(analysis.landmarks[outer][0] - analysis.landmarks[inner][0]) * width * 0.72,
      ry: Math.max(eyeDistance * 0.1, Math.abs(analysis.landmarks[brow][1] - analysis.landmarks[lower][1]) * height * 0.72)
    }));
    const inEyeDetails = (x, y) => eyeDetails.some((eye) => ((x - eye.x) / eye.rx) ** 2 + ((y - eye.y) / eye.ry) ** 2 <= 1);
    const features = buildFeatureMask(analysis, width, height, eyeDistance);
    const featurePreserveWeight = (x, y) => bilinear(
      features.mask,
      features.size,
      features.size,
      x / width * features.size - 0.5,
      y / height * features.size - 0.5
    );
    const foreheadLeft = analysis.landmarks[127][0] * width - eyeDistance * 0.02;
    const foreheadRight = analysis.landmarks[356][0] * width + eyeDistance * 0.02;
    const foreheadTop = analysis.landmarks[10][1] * height;
    const foreheadBottom = browY * height - eyeDistance * 0.06;
    const inForehead = (x, y) => x >= foreheadLeft && x <= foreheadRight && y >= foreheadTop && y <= foreheadBottom && !inEyeSampling(x, y) && !inEyeDetails(x, y);
    for (let y = 0; y < confidenceSize; y++) for (let x = 0; x < confidenceSize; x++) {
      const u = (x + 0.5) / confidenceSize, v = (y + 0.5) / confidenceSize;
      let inside = false;
      for (let index = 0, previous = outline.length - 1; index < outline.length; previous = index++) {
        const a = outline[index], b = outline[previous];
        if (a[1] > v !== b[1] > v && u < (b[0] - a[0]) * (v - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
      }
      sourceDistance[y * confidenceSize + x] = inside ? confidenceSize : 0;
      outsideDistance[y * confidenceSize + x] = inside ? 0 : confidenceSize;
    }
    for (const distance of [sourceDistance, outsideDistance]) {
      for (let y = 0; y < confidenceSize; y++) for (let x = 0; x < confidenceSize; x++) {
        const index = y * confidenceSize + x;
        if (x > 0) distance[index] = Math.min(distance[index], distance[index - 1] + 1);
        if (y > 0) distance[index] = Math.min(distance[index], distance[index - confidenceSize] + 1);
      }
      for (let y = confidenceSize - 1; y >= 0; y--) for (let x = confidenceSize - 1; x >= 0; x--) {
        const index = y * confidenceSize + x;
        if (x < confidenceSize - 1) distance[index] = Math.min(distance[index], distance[index + 1] + 1);
        if (y < confidenceSize - 1) distance[index] = Math.min(distance[index], distance[index + confidenceSize] + 1);
      }
    }
    for (let index = 0; index < sourceDistance.length; index++) {
      if (sourceDistance[index] === 0) sourceDistance[index] = -outsideDistance[index];
    }
    for (const id of regions) {
      const [u, v] = analysis.landmarks[id];
      for (let dy = -sampleRadius; dy <= sampleRadius; dy += 2) for (let dx = -sampleRadius; dx <= sampleRadius; dx += 2) {
        const x = u * width + dx, y = v * height + dy;
        const color = [0, 1, 2].map((c) => photo(x, y, c));
        const luma2 = luminance(color[0], color[1], color[2]);
        if (Math.abs(x - frontalCenterX) <= frontalSampleHalfWidth && !inEyeSampling(x, y) && mask(analysis.skin, x, y) > 0.72 && mask(analysis.hair, x, y) < 0.25 && luma2 > 12 && luma2 < 238) {
          pixelSkinSamples.push({ color, light: luma2 });
        }
      }
    }
    if (pixelSkinSamples.length < 8) throw new Error("Kh\xF4ng \u0111\u1EE7 v\xF9ng da r\xF5 \u0111\u1EC3 t\u1EA1o texture. Th\u1EED \u1EA3nh s\xE1ng \u0111\u1EC1u, kh\xF4ng b\u1ECB t\xF3c/kh\u1EA9u trang che m\u1EB7t.");
    const skinColor = sampleSkinColor(analysis, pixels, width, height).color;
    const skinLuma = luminance(...skinColor);
    const skinSaturation = (Math.max(...skinColor) - Math.min(...skinColor)) / Math.max(1, ...skinColor);
    const sortedSamples = [...pixelSkinSamples].sort((a, b) => a.light - b.light);
    const averageBand = (start, end) => {
      const first = Math.floor(sortedSamples.length * start), last = Math.max(first + 1, Math.ceil(sortedSamples.length * end));
      const band = sortedSamples.slice(first, last);
      return [0, 1, 2].map((channel) => band.reduce((sum, sample) => sum + sample.color[channel], 0) / band.length);
    };
    const skinDarkColor = averageBand(0.18, 0.42);
    const skinLightColor = averageBand(0.58, 0.82);
    const sampleRegions = [
      { region: "left-cheek", ids: [117, 101, 118, 205] },
      { region: "right-cheek", ids: [346, 330, 347, 425] },
      { region: "left-temple", ids: [127, 162, 54, 234] },
      { region: "right-temple", ids: [356, 389, 284, 454] },
      { region: "forehead", ids: [10, 151, 9, 108, 337, 109, 338, 67, 297] },
      { region: "jaw", ids: [172, 136, 397, 365] }
    ];
    const skinSamples = sampleRegions.flatMap(({ region, ids }) => ids.flatMap((id) => {
      const channels = [[], [], []];
      const [u, v] = analysis.landmarks[id];
      for (let dy = -sampleRadius; dy <= sampleRadius; dy += 2) for (let dx = -sampleRadius; dx <= sampleRadius; dx += 2) {
        const x = u * width + dx, y = v * height + dy;
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        if (inEyeSampling(x, y)) continue;
        const color2 = [0, 1, 2].map((channel) => photo(x, y, channel));
        const luma2 = luminance(color2[0], color2[1], color2[2]);
        const skin = mask(analysis.skin, x, y), hair = mask(analysis.hair, x, y);
        if (skin <= 0.72 || hair >= 0.25 || luma2 <= Math.max(28, skinLuma * 0.78) || luma2 >= 238) continue;
        const saturation = (Math.max(...color2) - Math.min(...color2)) / Math.max(1, ...color2);
        if (luma2 < skinLuma * 0.85 && saturation < skinSaturation * 0.6) continue;
        color2.forEach((value, channel) => channels[channel].push(value));
      }
      if (channels.some((channel) => channel.length < 8)) return [];
      const color = channels.map((channel) => trimmedMean(channel));
      return [{ region, position: template.positions[id], color }];
    }));
    const skinAt = createSkinField(skinColor, skinSamples, fit.params);
    const colorLayer = photoColorLayer(pixels, width, height, sourceDistance, skinColor);
    const mouthY = analysis.landmarks[13][1] * height;
    const chinY = analysis.landmarks[152][1] * height;
    const beardLeft = Math.min(analysis.landmarks[234][0], analysis.landmarks[454][0]) * width;
    const beardRight = Math.max(analysis.landmarks[234][0], analysis.landmarks[454][0]) * width;
    const mouthLeft = Math.min(analysis.landmarks[61][0], analysis.landmarks[291][0]) * width - eyeDistance * 0.08;
    const mouthRight = Math.max(analysis.landmarks[61][0], analysis.landmarks[291][0]) * width + eyeDistance * 0.08;
    const skinLinear = skinColor.map(srgbToLinear);
    const grainRadius = Math.max(2, eyeDistance * 8e-3);
    const grainOffsets = [-grainRadius, 0, grainRadius], blurOffsets = [-grainRadius / 3, 0, grainRadius / 3];
    const photoLight = (x, y) => luminance(photo(x, y, 0), photo(x, y, 1), photo(x, y, 2));
    const grainAt = (x, y) => {
      let squared = 0, totalLight = 0;
      for (const dy of grainOffsets) for (const dx of grainOffsets) {
        const light = photoLight(x + dx, y + dy);
        let blurred = 0;
        for (const by of blurOffsets) for (const bx of blurOffsets) blurred += photoLight(x + dx + bx, y + dy + by) / 9;
        squared += (light - blurred) ** 2;
        totalLight += light;
      }
      return Math.sqrt(squared / 9) / Math.max(totalLight / 9, 8);
    };
    const referenceGrain = Math.max(3e-3, ...[205, 425].map((id) => grainAt(analysis.landmarks[id][0] * width, analysis.landmarks[id][1] * height)));
    const skinLight = luminance(...skinColor);
    const skinWarmth = (skinColor[1] - skinColor[2]) / Math.max(skinColor[0], 8);
    const beardAnchorStrength = [150, 172, 176, 379, 397, 400].reduce((sum, id) => sum + feather(
      referenceGrain * 1.25,
      referenceGrain * 2.5,
      grainAt(analysis.landmarks[id][0] * width, analysis.landmarks[id][1] * height)
    ), 0) / 6;
    const beardPresence = feather(0.18, 0.48, beardAnchorStrength);
    const chinRegionAt = (x, y) => feather(mouthY + eyeDistance * 0.025, mouthY + eyeDistance * 0.09, y) * (1 - feather(chinY + eyeDistance * 0.015, chinY + eyeDistance * 0.055, y)) * feather(mouthLeft, mouthLeft + eyeDistance * 0.1, x) * (1 - feather(mouthRight - eyeDistance * 0.1, mouthRight, x));
    const beardProtection = new Float32Array(colorLayer.size * colorLayer.size);
    for (let y = 0; y < colorLayer.size; y++) for (let x = 0; x < colorLayer.size; x++) {
      const px = (x + 0.5) / colorLayer.size * width, py = (y + 0.5) / colorLayer.size * height;
      const region = feather(mouthY - eyeDistance * 0.35, mouthY - eyeDistance * 0.08, py) * (1 - feather(chinY + eyeDistance * 0.02, chinY + eyeDistance * 0.07, py)) * feather(beardLeft, beardLeft + eyeDistance * 0.12, px) * (1 - feather(beardRight - eyeDistance * 0.12, beardRight, px));
      if (region <= 0) continue;
      const darkStrands = feather(referenceGrain * 1.5, referenceGrain * 3, grainAt(px, py));
      const color = [0, 1, 2].map((channel) => photo(px, py, channel));
      const localLight = luminance(...color);
      const warmth = (color[1] - color[2]) / Math.max(color[0], 8);
      const warmChinHair = beardPresence * chinRegionAt(px, py) * feather(skinWarmth + 6e-3, skinWarmth + 0.065, warmth) * (1 - feather(0.88, 1.02, localLight / Math.max(skinLight, 8)));
      const inset = bilinear(sourceDistance, confidenceSize, confidenceSize, px / width * confidenceSize - 0.5, py / height * confidenceSize - 0.5);
      const outsideInset = bilinear(
        outsideDistance,
        confidenceSize,
        confidenceSize,
        px / width * confidenceSize - 0.5,
        py / height * confidenceSize - 0.5
      );
      const insideFace = 1 - feather(0.75, 2.5, outsideInset);
      beardProtection[y * colorLayer.size + x] = region * insideFace * Math.max(feather(0.2, 0.65, mask(analysis.hair, px, py)), darkStrands, warmChinHair);
    }
    const beardKernel = [1, 4, 6, 4, 1];
    for (const vertical of [false, true]) {
      const original = beardProtection.slice();
      for (let y = 0; y < colorLayer.size; y++) for (let x = 0; x < colorLayer.size; x++) {
        let value = 0;
        for (let tap = 0; tap < beardKernel.length; tap++) {
          const px = vertical ? x : clamp(x + tap - 2, 0, colorLayer.size - 1);
          const py = vertical ? clamp(y + tap - 2, 0, colorLayer.size - 1) : y;
          value += original[py * colorLayer.size + px] * beardKernel[tap] / 16;
        }
        beardProtection[y * colorLayer.size + x] = value;
      }
    }
    const skinColorMapSize = 512;
    const fallbackLinear = skinLinear;
    const sampleSkin = (u, v) => [0, 1, 2].map((channel) => srgbToLinear(photo(u * width, v * height, channel)));
    const isCleanSkin = (u, v) => {
      const px = u * width, py = v * height;
      const faceInset = bilinear(sourceDistance, confidenceSize, confidenceSize, u * confidenceSize - 0.5, v * confidenceSize - 0.5);
      const skinConfidence = mask(analysis.skin, px, py), hairConfidence = mask(analysis.hair, px, py);
      return faceInset >= -24 && skinConfidence > 0.72 && hairConfidence < 0.25 && !inEyeSampling(px, py) && !inEyeDetails(px, py);
    };
    const faceSeamMap = buildExtendedSkinMap(skinColorMapSize, fallbackLinear, isCleanSkin, sampleSkin);
    const foreheadMap = buildExtendedSkinMap(
      skinColorMapSize,
      fallbackLinear,
      (u, v) => isCleanSkin(u, v) && inForehead(u * width, v * height),
      sampleSkin,
      112
    );
    const hasForeheadSkin = foreheadMap.distance.some((distance) => distance === 0);
    const scalpSkinMap = hasForeheadSkin ? foreheadMap.map : faceSeamMap.map;
    const rearSkinMap = buildRearSkinMap(pixels, width, height, {
      left: foreheadLeft + eyeDistance * 0.08,
      right: foreheadRight - eyeDistance * 0.08,
      top: foreheadTop + eyeDistance * 0.04,
      bottom: foreheadBottom - eyeDistance * 0.04
    }, skinColorMapSize, fallbackLinear, skinSamples);
    const atlas = new Uint8ClampedArray(size * size * 4);
    const covered = new Uint8Array(size * size);
    for (let i = 0; i < atlas.length; i += 4) {
      atlas[i] = skinColor[0];
      atlas[i + 1] = skinColor[1];
      atlas[i + 2] = skinColor[2];
      atlas[i + 3] = 255;
    }
    const faceTriangles = mouthSurfaceTriangles(template.triangles.slice(0, template.faceTriangleCount));
    const surface = smoothHeadSurface({
      positions: facePositions(template, fit.params, fit.identity, fit.expression),
      detailWeights: fit.identity ? faceDetailWeights(template) : void 0,
      photoPoints: analysis.landmarks.slice(0, template.canonicalCount).map(([x, y]) => [x * width, y * height]),
      uv: template.uv.slice(0, template.canonicalCount),
      parts: Array(template.canonicalCount).fill("face"),
      triangles: faceTriangles,
      skinFade: Array(template.canonicalCount).fill(0),
      faceTriangleCount: faceTriangles.length
    });
    const posed = surface.positions.map((point) => rotate(point, fit.camera)), photoPoints = surface.photoPoints;
    const boundaryIds = surfaceBoundaryLoop(surface.triangles.slice(0, surface.faceTriangleCount), template.boundary[0]);
    const boundary = (boundaryIds.length ? boundaryIds : template.boundary).map((id) => surface.uv[id]);
    const distances = surface.uv.map((point) => boundaryDistance(point, boundary));
    const skinColors = surface.positions.map(skinAt);
    const normals = surface.positions.map(() => [0, 0, 0]);
    const depthSize = 384, depth = new Float32Array(depthSize * depthSize).fill(-Infinity);
    for (let i = 0; i < surface.faceTriangleCount; i++) {
      const tri = surface.triangles[i];
      const [a, b, c] = tri.map((vertex) => posed[vertex]);
      const ab = b.map((value, axis) => value - a[axis]), ac = c.map((value, axis) => value - a[axis]);
      const normal = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
      for (const vertex of tri) for (let axis = 0; axis < 3; axis++) normals[vertex][axis] += normal[axis];
      if (normal[2] <= 0) continue;
      raster(tri.map((vertex) => [photoPoints[vertex][0] / width * depthSize, photoPoints[vertex][1] / height * depthSize]), depthSize, depthSize, (x, y, wa, wb, wc) => {
        const z = a[2] * wa + b[2] * wb + c[2] * wc;
        const index = y * depthSize + x;
        depth[index] = Math.max(depth[index], z);
      });
    }
    const visibility = normals.map((normal) => feather(0.05, 0.4, normal[2] / Math.max(1e-12, Math.hypot(...normal))));
    const oblique = feather(0.25, 0.6, Math.abs(fit.camera.ry));
    let painted = 0;
    for (let i = 0; i < surface.faceTriangleCount; i++) {
      const tri = surface.triangles[i];
      const points = tri.map((vertex) => photoPoints[vertex]);
      const depths = tri.map((vertex) => posed[vertex][2]);
      raster(tri.map((vertex) => [surface.uv[vertex][0] * size, (1 - surface.uv[vertex][1]) * size]), size, size, (x, y, a, b, c) => {
        const px = points[0][0] * a + points[1][0] * b + points[2][0] * c;
        const py = points[0][1] * a + points[1][1] * b + points[2][1] * c;
        const distance = distances[tri[0]] * a + distances[tri[1]] * b + distances[tri[2]] * c;
        let alpha = 0;
        let featureWeight = featurePreserveWeight(px, py);
        let beardWeight = 0;
        let low = [0, 1, 2].map((channel) => bilinear(
          colorLayer.pixels,
          colorLayer.size,
          colorLayer.size,
          px / width * colorLayer.size - 0.5,
          py / height * colorLayer.size - 0.5,
          4,
          channel
        ));
        let source = [0, 1, 2].map((channel) => srgbToLinear(photo(px, py, channel)));
        let lowLight = luminance(...low);
        const z = depths[0] * a + depths[1] * b + depths[2] * c;
        if (px >= 0 && py >= 0 && px < width && py < height) {
          const depthConfidence = 1 - oblique * (1 - depthVisibility(depth, depthSize, px / width * depthSize, py / height * depthSize, z));
          const sourceInset = bilinear(sourceDistance, confidenceSize, confidenceSize, px / width * confidenceSize - 0.5, py / height * confidenceSize - 0.5);
          const accessory = inEyewear(px, py) ? feather(0.1, 0.4, mask(analysis.accessories, px, py)) : 0;
          const eyewear = inEyeDetails(px, py) || accessory > 0.5;
          featureWeight = Math.max(featureWeight, accessory);
          const hair = mask(analysis.hair, px, py);
          beardWeight = bilinear(
            beardProtection,
            colorLayer.size,
            colorLayer.size,
            px / width * colorLayer.size - 0.5,
            py / height * colorLayer.size - 0.5
          );
          const beardShift = eyeDistance * 0.06;
          const lowerBeardWeight = bilinear(
            beardProtection,
            colorLayer.size,
            colorLayer.size,
            px / width * colorLayer.size - 0.5,
            (py + beardShift) / height * colorLayer.size - 0.5
          );
          const chinRegion = chinRegionAt(px, py);
          const shiftedSource = [0, 1, 2].map((channel) => srgbToLinear(photo(px, py + beardShift, channel)));
          const sourceBeforeFill = luminance(...source);
          const shiftedSourceLight = luminance(...shiftedSource);
          const darkerStrandEvidence = feather(1.04, 1.25, sourceBeforeFill / Math.max(shiftedSourceLight, 8));
          const chinFill = chinRegion * feather(0.5, 0.8, lowerBeardWeight) * darkerStrandEvidence * 0.6;
          if (chinFill > 1e-3) {
            source = source.map((value, channel) => value * (1 - chinFill) + shiftedSource[channel] * chinFill);
            const shiftedLow = [0, 1, 2].map((channel) => bilinear(
              colorLayer.pixels,
              colorLayer.size,
              colorLayer.size,
              px / width * colorLayer.size - 0.5,
              (py + beardShift) / height * colorLayer.size - 0.5,
              4,
              channel
            ));
            low = low.map((value, channel) => value * (1 - chinFill) + shiftedLow[channel] * chinFill);
            lowLight = luminance(...low);
          }
          const filledBeardWeight = Math.max(beardWeight, chinFill);
          featureWeight = Math.max(featureWeight, filledBeardWeight);
          const protectedWeight = Math.max(eyewear ? 1 : 0, filledBeardWeight);
          const hairConfidence = 1 - feather(0.15, 0.65, hair) * (1 - protectedWeight);
          const skinConfidence = 1 - (1 - feather(0.01, 0.12, mask(analysis.skin, px, py))) * (1 - protectedWeight);
          const sourceConfidence = Math.max(feather(0, 5, sourceInset), filledBeardWeight) * hairConfidence * skinConfidence;
          const viewConfidence = visibility[tri[0]] * a + visibility[tri[1]] * b + visibility[tri[2]] * c;
          const lowerFace = feather(mouthY - eyeDistance * 0.35, mouthY - eyeDistance * 0.08, py);
          const outsideInset = bilinear(
            outsideDistance,
            confidenceSize,
            confidenceSize,
            px / width * confidenceSize - 0.5,
            py / height * confidenceSize - 0.5
          );
          const beardEdgeConfidence = filledBeardWeight * (1 - feather(0.75, 2.5, outsideInset));
          const edgeConfidence = Math.max(
            feather(2e-3, 0.13 - 0.075 * lowerFace, distance),
            beardEdgeConfidence
          );
          const projectedAlpha = edgeConfidence * viewConfidence * depthConfidence * sourceConfidence;
          const beardAlpha = beardEdgeConfidence * viewConfidence * depthConfidence;
          alpha = Math.max(projectedAlpha, beardAlpha);
          beardWeight = filledBeardWeight;
        }
        const index = (y * size + x) * 4;
        const sourceLight = luminance(...source);
        const contrast = Math.abs(sourceLight - lowLight) / Math.max(lowLight, 5e-3);
        const skinDetailGain = 1 / Math.sqrt(1 + (contrast / 0.35) ** 2);
        const detailStrength = 0.55 * skinDetailGain * (1 - featureWeight) + featureWeight;
        const relightStrength = 0.5 * (1 - featureWeight);
        const baseColor = [0, 1, 2].map((channel) => skinColors[tri[0]][channel] * a + skinColors[tri[1]][channel] * b + skinColors[tri[2]][channel] * c);
        const baseLight = luminance(...baseColor);
        const beardContrast = 1 + beardWeight * 0.85;
        const beardShade = 1 - beardWeight * 0.18 * (1 - feather(0.78, 0.98, sourceLight / Math.max(baseLight, 5e-3)));
        for (let channel = 0; channel < 3; channel++) {
          const relit = baseColor[channel] * relightStrength + low[channel] * (1 - relightStrength);
          atlas[index + channel] = linearToSrgb(
            (baseColor[channel] * (1 - alpha) + relit * alpha + (source[channel] - low[channel]) * alpha * detailStrength * beardContrast) * beardShade
          );
        }
        covered[y * size + x] = 1;
        if (alpha > 0.01) painted++;
      });
    }
    if (painted < size * size * 0.02) throw new Error("V\xF9ng m\u1EB7t d\xF9ng \u0111\u01B0\u1EE3c qu\xE1 \xEDt. H\xE3y ch\u1ECDn \u1EA3nh g\u1EA7n ch\xEDnh di\u1EC7n, kh\xF4ng che m\u1EB7t.");
    padAtlas(atlas, covered, size);
    return { atlas, atlasSize: size, scalpSkinMap, scalpSkinMapSize: skinColorMapSize, rearSkinMap, rearSkinMapSize: skinColorMapSize, skinColor, skinDarkColor, skinLightColor, skinSamples, projectedCoverage: painted / (size * size) };
  }

  // src/workers/generate.worker.ts
  self.onmessage = ({ data }) => {
    try {
      const { template, anchors, analysis, pixels, width, height, options } = data;
      self.postMessage({ type: "progress", phase: "fitting", progress: 0.45 });
      const fitStarted = performance.now();
      const fit = fitHead(template, anchors, analysis, options);
      const fittingTime = performance.now() - fitStarted;
      self.postMessage({ type: "progress", phase: "texturing", progress: 0.6 });
      const colorStarted = performance.now();
      const appearance = sampleSkinColor(analysis, pixels, width, height);
      const colorTime = performance.now() - colorStarted;
      if (appearance.warning) fit.warnings.push(appearance.warning);
      self.postMessage({ type: "progress", phase: "texturing", progress: 0.65 });
      const textureStarted = performance.now();
      let texture = {
        atlas: null,
        atlasSize: 1024,
        scalpSkinMap: null,
        scalpSkinMapSize: 512,
        rearSkinMap: null,
        rearSkinMapSize: 512,
        projectedCoverage: 0,
        skinColor: [...appearance.color],
        skinDarkColor: [...appearance.color],
        skinLightColor: [...appearance.color],
        skinSamples: []
      };
      try {
        texture = buildTexture(template, fit, analysis, pixels, width, height);
      } catch {
        fit.warnings.push("Kh\xF4ng t\u1EA1o \u0111\u01B0\u1EE3c texture t\u1EEB \u1EA3nh. \u0110ang hi\u1EC3n th\u1ECB h\xECnh h\u1ECDc v\u1EDBi m\xE0u da \u01B0\u1EDBc l\u01B0\u1EE3ng; chi ti\u1EBFt m\u1EAFt/m\xF4i t\u1EEB \u1EA3nh ch\u01B0a \u0111\u01B0\u1EE3c gi\u1EEF.");
      }
      const transfer = [];
      if (texture.atlas) transfer.push(texture.atlas.buffer);
      if (texture.scalpSkinMap) transfer.push(texture.scalpSkinMap.buffer);
      if (texture.rearSkinMap) transfer.push(texture.rearSkinMap.buffer);
      self.postMessage({ type: "result", result: { ...texture, fit, timings: { ...analysis.timings, fit: fittingTime, color: colorTime, texture: performance.now() - textureStarted } } }, { transfer });
    } catch {
      self.postMessage({ type: "error", code: "generation" });
    }
  };
})();
