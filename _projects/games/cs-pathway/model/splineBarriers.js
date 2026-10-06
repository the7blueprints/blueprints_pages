// Pure barrier math: no DOM or engine imports, so it is easy to test.
export function sampleSpline(points, segments = 20) {
  if (!Array.isArray(points) || points.length < 2) return [];
  const cr = (a, b, c, d, t) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i], p1 = points[i], p2 = points[i + 1], p3 = points[i + 2] || points[i + 1];
    for (let j = 0; j < segments; j++) {
      const t = j / segments;
      out.push({ x: cr(p0.x, p1.x, p2.x, p3.x, t), y: cr(p0.y, p1.y, p2.y, p3.y, t) });
    }
  }
  out.push({ ...points[points.length - 1] });
  return out;
}

export function closestPointOnSegment(p, a, b) {
  const abx = b.x - a.x, aby = b.y - a.y;
  const len2 = abx * abx + aby * aby || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2));
  return { x: a.x + t * abx, y: a.y + t * aby };
}

// Pushes a circle out of every polyline it overlaps and returns the corrected center.
export function resolveCircle(pos, radius, polylines) {
  let { x, y } = pos;
  for (let pass = 0; pass < 2; pass++) {
    for (const pts of polylines) {
      for (let i = 0; i < pts.length - 1; i++) {
        const c = closestPointOnSegment({ x, y }, pts[i], pts[i + 1]);
        const dx = x - c.x, dy = y - c.y;
        const d = Math.hypot(dx, dy);
        if (d < radius && d > 0) { x = c.x + (dx / d) * radius; y = c.y + (dy / d) * radius; }
      }
    }
  }
  return { x, y };
}
