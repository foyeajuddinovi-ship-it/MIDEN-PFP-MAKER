// -------------------------
// Elements
// -------------------------
const upload = document.getElementById('upload');
const preview = document.getElementById('preview'); // hidden image used by renderer
const canvas = document.getElementById('outputCanvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });

const sizeRange = document.getElementById('sizeRange');
const gapRange = document.getElementById('gapRange');
const localRange = document.getElementById('localRange');
const edgeRange = document.getElementById('edgeRange');
const varRange = document.getElementById('varRange');
const minRange = document.getElementById('minRange');
const biasRange = document.getElementById('biasRange');

const sizeVal = document.getElementById('sizeVal');
const gapVal = document.getElementById('gapVal');
const localVal = document.getElementById('localVal');
const edgeVal = document.getElementById('edgeVal');
const varVal = document.getElementById('varVal');
const minVal = document.getElementById('minVal');
const biasVal = document.getElementById('biasVal');

const invertChk = document.getElementById('invertChk');
const blockColorInput = document.getElementById('blockColor');
const bgColorInput = document.getElementById('bgColor');

const downloadBtn = document.getElementById('downloadBtn');
const resetBtn = document.getElementById('resetBtn');

// -------------------------
// Labels update
// -------------------------
function updateLabels(){
  sizeVal.textContent = sizeRange.value;
  gapVal.textContent = gapRange.value;
  localVal.textContent = (localRange.value/100).toFixed(2);
  edgeVal.textContent = edgeRange.value;
  varVal.textContent = varRange.value;
  minVal.textContent = minRange.value;
  biasVal.textContent = biasRange.value;
}
updateLabels();

// attach inputs
[sizeRange,gapRange,localRange,edgeRange,varRange,minRange,biasRange].forEach(el=>{
  el.addEventListener('input', ()=>{ updateLabels(); if(preview.src) render(); });
});
invertChk.addEventListener('change', ()=>{ if(preview.src) render(); });
blockColorInput.addEventListener('input', ()=>{ if(preview.src) render(); });
bgColorInput.addEventListener('input', ()=>{ if(preview.src) render(); });

// -------------------------
// Upload handling (simple, reliable)
// -------------------------
upload.addEventListener('change', (e)=>{
  const file = e.target.files && e.target.files[0];
  if(!file) return;
  if(!file.type || !file.type.startsWith('image/')) { alert('Please select an image file (png/jpg/webp)'); return; }

  const fr = new FileReader();
  fr.onload = (ev) => {
    preview.src = ev.target.result; // triggers preview load -> render()
  };
  fr.onerror = ()=> { alert('Failed to read file'); };
  fr.readAsDataURL(file);
});

// when preview image loaded, render
preview.addEventListener('load', ()=> {
  render();
});

// -------------------------
// Download & Reset
// -------------------------
downloadBtn.addEventListener('click', ()=> {
  const a = document.createElement('a');
  a.download = 'pfp_pixel.png';
  a.href = canvas.toDataURL('image/png');
  a.click();
});

resetBtn.addEventListener('click', ()=> {
  sizeRange.value = 12; gapRange.value = 12; localRange.value = 80; edgeRange.value = 18;
  varRange.value = 30; minRange.value = 4; biasRange.value = 0; invertChk.checked = false;
  blockColorInput.value = '#ff5a00'; bgColorInput.value = '#ffffff';
  updateLabels();
  if(preview.src) render(); else drawPlaceholder();
});

// -------------------------
// Utilities
// -------------------------
function lumAt(data, idx){
  return 0.2126*data[idx] + 0.7152*data[idx+1] + 0.0722*data[idx+2];
}

function hexToRgb(hex){
  if(!hex) return [255,90,0];
  hex = hex.replace('#','');
  if(hex.length===3) hex = hex.split('').map(c=>c+c).join('');
  const num = parseInt(hex,16);
  return [(num>>16)&255, (num>>8)&255, num&255];
}

function computeSobel(sdata, w, h){
  const mag = new Float32Array(w*h);
  function L(x,y){
    if(x<0) x=0; if(y<0) y=0; if(x>=w) x=w-1; if(y>=h) y=h-1;
    return lumAt(sdata, (y*w + x)*4);
  }
  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      const gx = -1*L(x-1,y-1) + 1*L(x+1,y-1) + -2*L(x-1,y) + 2*L(x+1,y) + -1*L(x-1,y+1) + 1*L(x+1,y+1);
      const gy = -1*L(x-1,y-1) + -2*L(x,y-1) + -1*L(x+1,y-1) + 1*L(x-1,y+1) + 2*L(x,y+1) + 1*L(x+1,y+1);
      mag[y*w + x] = Math.hypot(gx,gy);
    }
  }
  return mag;
}

function blockStats(sdata, w, h, bx, by, bw, bh){
  let sum=0, sum2=0, count=0;
  for(let y=by;y<Math.min(h,by+bh);y++){
    for(let x=bx;x<Math.min(w,bx+bw);x++){
      const idx=(y*w + x)*4;
      const L = lumAt(sdata, idx);
      sum += L; sum2 += L*L; count++;
    }
  }
  const mean = count? sum/count : 0;
  const variance = count? (sum2/count - mean*mean) : 0;
  return {mean, variance};
}

// -------------------------
// Main renderer
// -------------------------
function render(){
  // params
  const block = Math.max(2, parseInt(sizeRange.value,10));
  const gapPerc = Math.max(0, Math.min(0.5, parseInt(gapRange.value,10)/100));
  const localFactor = parseInt(localRange.value,10)/100;
  const edgeBoost = parseInt(edgeRange.value,10);
  const varThresh = parseFloat(varRange.value);
  const minBlock = Math.max(2, parseInt(minRange.value,10));
  const bias = parseInt(biasRange.value,10);
  const invert = invertChk.checked;
  const blockColor = hexToRgb(blockColorInput.value);
  const bgColor = bgColorInput.value || '#ffffff';

  // scale preview into canvas
  const maxDim = 1200;
  const iw = preview.naturalWidth || 640;
  const ih = preview.naturalHeight || 640;
  const ratio = Math.min(1, maxDim/Math.max(iw,ih));
  const w = Math.max(1, Math.round(iw*ratio)), h = Math.max(1, Math.round(ih*ratio));
  canvas.width = w; canvas.height = h;

  // draw source to read pixels
  ctx.clearRect(0,0,w,h);
  ctx.drawImage(preview, 0, 0, w, h);
  const src = ctx.getImageData(0,0,w,h);
  const sdata = src.data;

  // global mean
  let gsum = 0;
  for(let i=0;i<w*h;i++) gsum += lumAt(sdata, i*4);
  const globalMean = gsum / Math.max(1, w*h);

  // sobel
  const sob = computeSobel(sdata, w, h);

  // background
  ctx.fillStyle = bgColor; ctx.fillRect(0,0,w,h);

  // recursive process
  function process(bx,by,bw,bh){
    const stats = blockStats(sdata, w, h, bx, by, bw, bh);
    const localMean = stats.mean;
    const threshold = globalMean*(1-localFactor) + localMean*localFactor + bias;

    // edge influence
    let maxEdge = 0;
    for(let y=by;y<Math.min(h,by+bh);y++){
      for(let x=bx;x<Math.min(w,bx+bw);x++){
        maxEdge = Math.max(maxEdge, sob[y*w + x]);
      }
    }

    let useBlockColor = stats.mean < threshold || maxEdge > edgeBoost;
    if(invert) useBlockColor = !useBlockColor;

    // subdivide if necessary
    if(stats.variance > varThresh && Math.max(bw,bh) > minBlock){
      const hw = Math.floor(bw/2), hh = Math.floor(bh/2);
      if(hw>0 && hh>0){
        process(bx,by,hw,hh);
        process(bx+hw,by,bw-hw,hh);
        process(bx,by+hh,hw,bh-hh);
        process(bx+hw,by+hh,bw-hw,bh-hh);
        return;
      }
    }

    // draw block with gap
    const gapX = Math.min(bw-1, Math.max(0, Math.floor(bw * gapPerc)));
    const gapY = Math.min(bh-1, Math.max(0, Math.floor(bh * gapPerc)));
    const drawW = Math.max(1, bw - gapX), drawH = Math.max(1, bh - gapY);
    const offsetX = Math.floor(gapX/2), offsetY = Math.floor(gapY/2);

    if(useBlockColor){
      ctx.fillStyle = `rgb(${blockColor[0]},${blockColor[1]},${blockColor[2]})`;
    } else {
      ctx.fillStyle = bgColor;
    }
    ctx.fillRect(bx + offsetX, by + offsetY, drawW, drawH);

    // subtle specks
    if(useBlockColor && (bw>4 || bh>4)){
      ctx.fillStyle = bgColor;
      const dots = Math.max(0, Math.floor((bw*bh)/60));
      for(let i=0;i<dots;i++){
        const rx = bx + offsetX + Math.floor(Math.random()*(drawW));
        const ry = by + offsetY + Math.floor(Math.random()*(drawH));
        if(rx<w && ry<h) ctx.fillRect(rx, ry, 1, 1);
      }
    }
  }

  for(let by=0; by<h; by += block){
    for(let bx=0; bx<w; bx += block){
      const bw = Math.min(block, w-bx);
      const bh = Math.min(block, h-by);
      process(bx, by, bw, bh);
    }
  }

  // keep canvas display size reasonable
  canvas.style.width = Math.min(720, w) + 'px';
  canvas.style.height = 'auto';
}

// -------------------------
// Initial placeholder
// -------------------------
function drawPlaceholder(){
  const w=640,h=640; canvas.width=w; canvas.height=h;
  ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,w,h);
  ctx.fillStyle='#f3f3f3'; ctx.fillRect(40,40,w-80,h-80);
  ctx.fillStyle='#999'; ctx.font='18px sans-serif'; ctx.textAlign='center';
  ctx.fillText('Choose an image to start', w/2, h/2);
  canvas.style.width = Math.min(720, w) + 'px';
}
drawPlaceholder();

// expose for debugging
window.render = render;
