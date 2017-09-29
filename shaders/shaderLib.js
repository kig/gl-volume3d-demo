module.exports = {
  raytrace: `
    struct Box {
      vec3 minPoint;
      vec3 maxPoint;
    };

    bool boxIntersect(vec3 ro, vec3 rd, Box box, out float t1, out float t2, out vec3 nml)
    {
      vec3 ird = 1.0 / rd;
      vec3 v1 = (box.minPoint - ro) * ird;
      vec3 v2 = (box.maxPoint - ro) * ird;
      vec3 n = min(v1, v2);
      vec3 f = max(v1, v2);
      float enter = max(n.x, max(n.y, n.z));
      float exit = min(f.x, min(f.y, f.z));
      if (exit > 0.0 && enter < exit) {
        t1 = enter;
        t2 = exit;
        return true;
      }
      return false;
    }

    bool planeIntersect(vec3 ro, vec3 rd, vec3 p, vec3 nml, out float t)
    {
      float d = dot(nml, rd);
      if (d <= 0.0) {
        return false;
      }
      d = -dot(ro-p, nml) / d;
      if (d < 0.0) {
        return false;
      }
      t = d;
      return true;
    }
    `
};
