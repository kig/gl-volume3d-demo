const canvas   = document.body.appendChild(document.createElement('canvas'));
const gl       = canvas.getContext('webgl2');
const now      = require('right-now');
const mat4     = require('gl-mat4');
const vec3     = require('gl-vec3');
const isosurface = require('./lib/fastIsosurface');

const shaders = require('./shaders/shaders.js');

const computeVertexNormals = require('./lib/computeVertexNormals').computeVertexNormals

var params = {
  renderer: 'isosurface',
  isocaps: true,
  smoothing: false,
  isoLevel: 0.65,
  isoRange: 0.6,
  raySteps: 256
};

var clipBox = {
  min: [0.3, 0.3, 0.2],
  max: [0.8, 0.8, 0.8]
};

var distance = 3;
var fov = 30;
var theta = 4;
var alpha = -0.5;

function ifWarn(name, str) {
  if (str && /[^\s\0]/.test(str)) {
    console.error(name+"\n"+str);
    return str;
  }
  return false;
}

function createProgram(gl, vert, frag) {
  var vs = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vs, vert);
  gl.compileShader(vs);
  var fs = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fs, frag);
  gl.compileShader(fs);

  var program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.deleteShader(vs);
  gl.attachShader(program, fs);
  gl.deleteShader(fs);
  gl.linkProgram(program);
  var error = false;
  error |= ifWarn('program', gl.getProgramInfoLog(program));
  error |= ifWarn('vertex', gl.getShaderInfoLog(vs));
  error |= ifWarn('fragment', gl.getShaderInfoLog(fs));
  if (error) {
    throw(new Error("Invalid shader"));
  }
  return program;
}

var rayProgram = createProgram(gl, shaders.rayMarch.vert, shaders.rayMarch.frag);
var isoProgram = createProgram(gl, shaders.isoSurface.vert, shaders.isoSurface.frag);
var isoCapProgram = createProgram(gl, shaders.isoCap.vert, shaders.isoCap.frag);

var down = false;
var downPos = [0, 0];
var pos = [0, 0];
var delta = [0, 0];

window.onmousedown = function(ev) {
  if (ev.target.tagName === 'CANVAS') {
    ev.preventDefault();
    down = true;
    downPos = [ev.clientX, ev.clientY];
  }
};

window.onmousemove = function(ev) {
  if (down) {
    pos = [ev.clientX, ev.clientY];
    delta = pos.map((v,i) => v - downPos[i]);
    downPos = pos;
    theta -= delta[0] * 0.01;
    while (theta < 0) {
      theta += Math.PI*2;
    }
    theta %= Math.PI*2;
    alpha -= delta[1] * 0.01;
    alpha = Math.max(-Math.PI/2, Math.min(Math.PI/2, alpha));
    ev.preventDefault();
  }
};

window.onmouseup = function(ev) {
  if (down) {
    ev.preventDefault();
    down = false;
  }
};

window.addEventListener('wheel', function(ev) {
  ev.preventDefault();
  var wheelDelta = ev.wheelDeltaY || ev.deltaY || ev.wheelDelta || ev.detail;
  if (wheelDelta === undefined) {
    wheelDelta = 0;
  }
  distance *= Math.pow(1.01, -wheelDelta);
  distance = Math.max(0.5, Math.min(10, distance));
}, false);

var controls = document.createElement('form');
controls.className = 'controls';
controls.style.position = 'absolute';
controls.style.zIndex = 1;
controls.style.left = '10px';
controls.style.top = '10px';
controls.appendChild(createSlider('Min X', clipBox.min, 0, 0, 1));
controls.appendChild(createSlider('Min Y', clipBox.min, 1, 0, 1));
controls.appendChild(createSlider('Min Z', clipBox.min, 2, 0, 1));
controls.appendChild(createSlider('Max X', clipBox.max, 0, 0, 1));
controls.appendChild(createSlider('Max Y', clipBox.max, 1, 0, 1));
controls.appendChild(createSlider('Max Z', clipBox.max, 2, 0, 1));
controls.appendChild(createSlider('Iso level', params, 'isoLevel', 0, 1));
controls.appendChild(createSlider('Iso range', params, 'isoRange', 0, 1));
controls.appendChild(createRadioGroup('Renderer', params, 'renderer', 
  [
    ['Isosurface', 'isosurface'],
    ['Volume', 'volume']
  ]
));
controls.appendChild(createCheckbox('Smoothing', params, 'smoothing'));
controls.appendChild(createCheckbox('Isocaps', params, 'isocaps'));
controls.appendChild(createSlider('Raymarch steps', params, 'raySteps', 32, 384));
document.body.appendChild(controls);

function createSlider(name, targetObj, targetValue, minValue, maxValue) {
  var reader = (x) => parseFloat(x.value);
  return createInput(name, targetObj, targetValue, 'range', reader, {
    min: minValue,
    max: maxValue,
    step: 0.001,
    value: targetObj[targetValue]
  });
}

function createCheckbox(name, targetObj, targetValue) {
  var reader = (x) => x.checked;
  return createInput(name, targetObj, targetValue, 'checkbox', reader, {
    checked: targetObj[targetValue]
  });
}

function createRadioGroup(name, targetObj, targetValue, options) {
  var div = document.createElement('div');
  var title = document.createElement('h4');
  title.textContent = name;
  div.appendChild(title);
  options.forEach(function(opt) {
    var [oname, ovalue] = opt;
    var inputContainer = document.createElement('div');
    var label = document.createElement('label');
    label.textContent = ' ' + oname;
    var input = document.createElement('input');
    input.name = name;
    input.type = 'radio';
    input.value = ovalue;
    input.checked = targetObj[targetValue] === ovalue;
    input.oninput = input.onchange = function(ev) {
      targetObj[targetValue] = this.form[name].value;
    };
    inputContainer.appendChild(input);
    inputContainer.appendChild(label);
    div.appendChild(inputContainer);
  });
  return div;
}

function createInput(name, targetObj, targetValue, type, reader, params) {
  var inputContainer = document.createElement('div');
  var label = document.createElement('label');
  label.for = name;
  label.textContent = name;
  var input = document.createElement('input');
  input.id = name;
  input.type = type;
  for (var i in params) {
    input[i] = params[i];
  }
  input.oninput = input.onchange = function(ev) {
    targetObj[targetValue] = reader(this);
  };
  inputContainer.appendChild(label);
  inputContainer.appendChild(input);
  return inputContainer;
}

var getData = function(fn, responseType, callback) {
  if (!callback) {
    callback = responseType;
    responseType = 'text';
  }
  var xhr = new XMLHttpRequest;
  xhr.responseType = responseType;
  xhr.onload = function() {
    callback(xhr.response);
  };
  xhr.open('GET', fn, true);
  xhr.send();
};

var getDataMulti = function(fns, responseType, callback) {
  if (!callback) {
    callback = responseType;
    responseType = 'text';
  }
  var todo = fns.length;
  var results = [];
  var handle = function(idx) {
    return function(data) {
      results[idx] = data;
      todo--;
      if (todo === 0) {
        callback(results);
      }
    };
  };
  fns.forEach(function(fn, idx) { getData(fn, responseType, handle(idx)); });
};

var parseCSV = function(str) {
  return str.replace(/^\s+|\s+$/g, '').split(/\r?\n/g).map(function(x) { return x.split(',').map(parseFloat) });
};

getData('data/MRbrain.txt', 'arraybuffer', function(mriBuffer) {

  const dims = [256, 256, 109];
  const [dataWidth, dataHeight, dataDepth] = dims;

  const mri = new Uint16Array(mriBuffer);
  for (var i=0; i<mri.length; i++) {
    mri[i] = ((mri[i] << 8) & 0xff00) | (mri[i] >> 8);
  }

  var triangleMatrix   = mat4.create()
  var projectionMatrix = mat4.create()


  // ISOSURFACE TODO
  /*
    [x] Isosurface using marching cubes
    [x] Caps with alpha mask and clip box test
      - looks bad, doesn't seal the volume 
    [x] Update isosurface on params changes
      - it's very slow
    [ ] Generate cap geometry
      - Generate isosurface
      - Raycast along clip plane and count intersections
      - Generate triangles for rays with odd number of intersections
    [x] Generate smooth vertex normals for the isosurface
      - Find the faces that share the vertex
      - Average the face normals
    [ ] Experiment with marching cubes in the ray marcher
  */

  var bounds = [
    [0,0,0], 
    [dataWidth, dataHeight, dataDepth]
  ];

  function updateIsosurface(gl, isoBuffer, isoNormalBuffer, isoCapBuffer, isoCapNormalBuffer, dims, mri, clipBox) {
    var isoLevel = ((params.isoLevel * 2000)+1300)|0;
    var isoRange = (params.isoRange * 2000)|0;
    var a = clipBox.min;
    var b = clipBox.max;
    var ibounds = [[0,0,0], dims];
//      clipBox.min.map((v,i) => Math.floor(v * dims[i])),
//      clipBox.max.map((v,i) => Math.ceil(v * dims[i])),
//    ];
    var iso = isosurface.marchingCubes(dims, mri, isoLevel-isoRange, isoLevel+isoRange, ibounds);
    var cap = isosurface.marchingCubesCaps(dims, mri, isoLevel-isoRange, isoLevel+isoRange, ibounds);
    if (params.smoothing) {
      computeVertexNormals(iso.vertices, iso.normals, iso.normals);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, isoBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, iso.vertices, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, isoNormalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, iso.normals, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, isoCapBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, cap.vertices, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, isoCapNormalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, cap.normals, gl.STATIC_DRAW);

    return [iso.vertices.length / 3, cap.vertices.length / 3];
  }

  var data = new Uint8Array(dataWidth*dataHeight*dataDepth*4);
  var mriMin = 1/0;
  var mriMax = -1/0;
  for (var i=0; i<mri.length; i++) {
    var v = mri[i];
    if (v < mriMin) mriMin = v;
    if (v > mriMax) mriMax = v;
  }
  for (var i=0; i<mri.length; i++) {
    var v = Math.max(0, Math.min(1, (mri[i]-1300)/2000)) * 255;
    data[i*4] = v;
    data[i*4+1] = v;
    data[i*4+2] = v;
    data[i*4+3] = v > 0 ? 255 : 0;
  }

  var texture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_3D, texture);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_BASE_LEVEL, 0);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAX_LEVEL, Math.log2(dataWidth));
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); //_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage3D(
    gl.TEXTURE_3D,  // target
    0,              // level
    gl.RGBA,        // internalformat
    dataWidth,      // width
    dataHeight,     // height
    dataDepth,      // depth
    0,              // border
    gl.RGBA,        // format
    gl.UNSIGNED_BYTE, // type
    data            // pixel
  );
  //gl.generateMipmap(gl.TEXTURE_3D);

  var triangleBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, triangleBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1.0, +1.0, +0.0,
      -1.0, -1.0, +0.0,
      +1.0, -1.0, +0.0,

      -1.0, +1.0, +0.0,
      +1.0, -1.0, +0.0,
      +1.0, +1.0, +0.0
    ]), gl.STATIC_DRAW);

  var isoBuffer = gl.createBuffer();
  var isoNormalBuffer = gl.createBuffer();

  var isoCapBuffer = gl.createBuffer();
  var isoCapNormalBuffer = gl.createBuffer();

  var isoVerticeCount = 0;
  var isoCapVerticeCount = 0;
  var currentIsoLevel;
  var currentIsoRange;
  var currentSmoothing;
  var currentBounds;


  gl.getCachedUniformLocation = function(program, name) {
    if (!program.uniformLocations) {
      program.uniformLocations = {};
    }
    if (!program.uniformLocations[name]) {
      program.uniformLocations[name] = this.getUniformLocation(program, name);
    }
    return program.uniformLocations[name];
  };

  function setUniforms(gl, program, width, height) {
    gl.useProgram(program);
    gl.uniform1i(gl.getCachedUniformLocation(program, 'uTexture'), 0);
    gl.uniform1i(gl.getCachedUniformLocation(program, 'uIsocaps'), params.isocaps ? 1 : 0);
    gl.uniform1f(gl.getCachedUniformLocation(program, 'uTime'), now() / 1000.0);
    gl.uniform1f(gl.getCachedUniformLocation(program, 'uIsoLevel'), params.isoLevel);
    gl.uniform1f(gl.getCachedUniformLocation(program, 'uIsoRange'), params.isoRange);
    gl.uniform1f(gl.getCachedUniformLocation(program, 'uRaySteps'), params.raySteps);
    gl.uniform2f(gl.getCachedUniformLocation(program, 'uResolution'), width, height);
    gl.uniform3fv(gl.getCachedUniformLocation(program, 'uDimensions'), dims);
    gl.uniform3fv(gl.getCachedUniformLocation(program, 'uClipBoxMin'), clipBox.min);
    gl.uniform3fv(gl.getCachedUniformLocation(program, 'uClipBoxMax'), clipBox.max);
    gl.uniform3fv(gl.getCachedUniformLocation(program, 'uLightPosition'), [1,1,1]);
    gl.uniform4fv(gl.getCachedUniformLocation(program, 'uLightColor'), [1,1,1,1]);
    gl.uniformMatrix4fv(gl.getCachedUniformLocation(program, 'uProjection'), false, projectionMatrix);
    gl.uniformMatrix4fv(gl.getCachedUniformLocation(program, 'uModelView'), false, triangleMatrix);
  }

  // WebGL 2.0 is going to a direction where you have a program
  // that maps input buffers to output buffers.
  // You run the program and then fiddle with the buffers (CRUD).
  function runShader(gl, program, uniforms, buffers, drawBuffers) {
    gl.useProgram(program);
    for (var i=0; i<buffers.length; i++) {
      var buffer = buffers[i];
      gl.bindBuffer(buffer.target, buffer);
      gl.enableVertexAttribArray(i);
      if (buffer.integer) {
        gl.vertexAttribPointer(i, buffer.size, buffer.type, buffer.normalized, buffer.stride, buffer.offset);
      } else {
        gl.vertexAttribIPointer(i, buffer.size, buffer.type, buffer.stride, buffer.offset);
      }
    }
    var texUnit = 0;
    for (var i in uniforms) {
      var loc = gl.getCachedUniformLocation(program, i);
      var v = uniforms[i];
      if (v instanceof WebGLTexture) {
        gl.activeTexture(texUnit);
        gl.bindTexture(v.type, v);
        gl.uniform1i(loc, texUnit);
        texUnit++;
      } else {
        gl[v.type](loc, v.value);
      }
    }
  }

  function setBuffer(gl, location, buffer, a,b,c,d,e) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, a, b, c, d, e);      
  }

  function render() {
    if (params.renderer === 'isosurface' && (
      params.smoothing !== currentSmoothing || 
      params.isoLevel !== currentIsoLevel || 
      params.isoRange !== currentIsoRange ||
      false //JSON.stringify(clipBox) !== currentBounds
    )) {
      var counts = updateIsosurface(gl, isoBuffer, isoNormalBuffer, isoCapBuffer, isoCapNormalBuffer, dims, mri, clipBox);
      isoVerticeCount = counts[0];
      isoCapVerticeCount = counts[1];
      currentIsoLevel = params.isoLevel;
      currentIsoRange = params.isoRange;
      currentSmoothing = params.smoothing;
      //currentBounds = JSON.stringify(clipBox);
    }
    var width = gl.drawingBufferWidth;
    var height = gl.drawingBufferHeight;

    // Clear the screen and set the viewport before
    // drawing anything
    gl.clearColor(1,1,1,1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
    gl.viewport(0, 0, width, height);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);

    // Calculate projection matrix
    mat4.perspective(projectionMatrix, fov / 180 * Math.PI, width / height, 0.1, 100);
    var pos = [
      Math.cos(theta) * Math.cos(alpha) * distance,
      Math.sin(alpha) * distance,
      Math.sin(theta) * Math.cos(alpha) * distance
    ];
    mat4.lookAt(triangleMatrix, pos, [0,0,0], [0,-1,0]);
    mat4.translate(triangleMatrix, triangleMatrix, [-0.5, -0.5, -0.275]);
    mat4.scale(triangleMatrix, triangleMatrix, [1, 1, 0.55]);

    if (params.renderer === 'volume') {
      setUniforms(gl, rayProgram, width, height);
      setBuffer(gl, 0, triangleBuffer, 3, gl.FLOAT, false, 0, 0);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    if (params.renderer === 'isosurface') {
      setUniforms(gl, isoProgram, width, height);
      setBuffer(gl, 0, isoBuffer, 3, gl.FLOAT, false, 0, 0);
      setBuffer(gl, 1, isoNormalBuffer, 3, gl.FLOAT, false, 0, 0);

      gl.drawArrays(gl.TRIANGLES, 0, isoVerticeCount);

      if (params.isocaps && isoCapVerticeCount > 0) {
        setUniforms(gl, isoProgram, width, height);
        setBuffer(gl, 0, isoCapBuffer, 3, gl.FLOAT, false, 0, 0);
        setBuffer(gl, 1, isoCapNormalBuffer, 3, gl.FLOAT, false, 0, 0);

        gl.drawArrays(gl.TRIANGLES, 0, isoCapVerticeCount);
      }
    }
  }

  // Resize the canvas to fit the screen
  window.addEventListener('resize'
    , require('canvas-fit')(canvas)
    , false
  )

  function tick() {
    render();
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);


})