function makeDraggable(el, handle) {
  let isDown=false, startX, startY, startLeft, startTop;
  handle.addEventListener('pointerdown', e => {
    isDown=true; startX=e.clientX; startY=e.clientY;
    startLeft=parseInt(window.getComputedStyle(el).left,10)||el.offsetLeft||0;
    startTop=parseInt(window.getComputedStyle(el).top,10)||el.offsetTop||0;
    handle.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  handle.addEventListener('pointermove', e => {
    if(!isDown)return;
    el.style.left=(startLeft+e.clientX-startX)+'px';
    el.style.top=(startTop+e.clientY-startY)+'px';
  });
  handle.addEventListener('pointerup', e => {
    isDown=false; handle.releasePointerCapture(e.pointerId);
  });
}
document.addEventListener('DOMContentLoaded', ()=>{
  ['toolbar', 'sel-toolbar'].forEach(id=>{
    const el=document.getElementById(id);
    if(el){
      const handle=el.querySelector('.drag-handle');
      if(handle) makeDraggable(el, handle);
    }
  });
});

const CW=1280,CH=720;
// Dynamic layer arrays — filled by initLayers()
const layerCanvases=[], fillCanvases=[], layerCtxs=[], fillCtxs=[];
const cBg=document.getElementById('c-bg'),cPrev=document.getElementById('c-onion-prev'),cNext=document.getElementById('c-onion-next');
const cGrid=document.getElementById('c-grid'),cSym=document.getElementById('c-sym');
const cTransform=document.getElementById('c-transform');
const cPrev2=document.getElementById('c-preview'),cLasso=document.getElementById('c-lasso'),cTop=document.getElementById('c-top');
const ctxBg=cBg.getContext('2d'),ctxPrev=cPrev.getContext('2d',{willReadFrequently:true}),ctxNext=cNext.getContext('2d',{willReadFrequently:true});
const ctxGrid=cGrid.getContext('2d'),ctxSym=cSym.getContext('2d'),ctxTransform=cTransform.getContext('2d');
const ctxPreview=cPrev2.getContext('2d'),ctxLasso=cLasso.getContext('2d'),ctxTop=cTop.getContext('2d',{willReadFrequently:true});
const stack=document.getElementById('canvas-stack'),area=document.getElementById('canvas-area');

// Fixed canvases (not layers)
const fixedC=[cBg,cPrev,cNext,cGrid,cSym,cTransform,cPrev2,cLasso,cTop];
fixedC.forEach(c=>{c.width=CW;c.height=CH;});
ctxBg.fillStyle='#fff';ctxBg.fillRect(0,0,CW,CH);
fillCtxs.forEach&&fillCtxs.forEach(ctx=>ctx.clearRect(0,0,CW,CH));

// Create one layer canvas pair and insert before cGrid
function makeLayerPair(){
  const fill=document.createElement('canvas');fill.width=CW;fill.height=CH;
  fill.style.position='absolute';fill.style.top='0';fill.style.left='0';
  fill.style.pointerEvents='none';
  const ink=document.createElement('canvas');ink.width=CW;ink.height=CH;
  ink.style.position='absolute';ink.style.top='0';ink.style.left='0';
  ink.style.pointerEvents='none';
  // Insert fill then ink — each new pair goes just before cGrid
  // so the LAST layer added ends up closest to cGrid = highest in visual stack
  stack.insertBefore(fill,cGrid);
  stack.insertBefore(ink,cGrid);
  fillCanvases.push(fill);
  layerCanvases.push(ink);
  fillCtxs.push(fill.getContext('2d',{willReadFrequently:true}));
  layerCtxs.push(ink.getContext('2d',{willReadFrequently:true}));
}

// Init layers — index 0 = bottom layer, last index = top layer
// Insertion order: first pair inserted = deepest in DOM = lowest visual stack
function initLayers(){
  layerMeta.forEach(()=>makeLayerPair());
}

let scale=1;
// viewport: vOffX/vOffY = top-left corner of canvas in area coords
let vZoom=1, vRotate=0, vOffX=0, vOffY=0;
let baseScale=1;

function applyViewport(){
  const totalScale=baseScale*vZoom;
  scale=totalScale;
  const sw=Math.floor(CW*totalScale), sh=Math.floor(CH*totalScale);
  // Size all canvases: fixed ones + dynamic layer canvases
  const refC=document.getElementById('c-ref');
  const allC=[cBg,cPrev,cNext,...fillCanvases,...layerCanvases,cGrid,cSym,cTransform,cPrev2,cLasso,cTop];
  if(refC) allC.push(refC);
  allC.forEach(c=>{
    c.style.width=sw+'px'; c.style.height=sh+'px';
    c.style.position='absolute'; c.style.top='0'; c.style.left='0';
  });
  // position and rotate the stack
  stack.style.width=sw+'px'; stack.style.height=sh+'px';
  stack.style.transform=`translate(${vOffX}px,${vOffY}px) rotate(${vRotate}deg)`;
  stack.style.transformOrigin='0 0';
  updateViewInfo();
  drawGrid(); drawSymGuide();
  updateCursor();
}

function centerCanvas(){
  const aw=area.clientWidth, ah=area.clientHeight;
  const sw=CW*baseScale*vZoom, sh=CH*baseScale*vZoom;
  vOffX=(aw-sw)/2; vOffY=(ah-sh)/2;
}

function resize(){
  const aw=area.clientWidth, ah=area.clientHeight;
  baseScale=Math.min(aw/CW, ah/CH)*0.92;
  centerCanvas();
  applyViewport();
}
new ResizeObserver(resize).observe(area); setTimeout(resize,40);
window.addEventListener('resize',resize);

function updateViewInfo(){
  const el=document.getElementById('view-info');
  if(el) el.textContent=Math.round(vZoom*100)+'%  '+Math.round(vRotate)+'°';
}

function resetView(){vZoom=1; vRotate=0; centerCanvas(); applyViewport();}

// ── Zoom: scroll wheel focused on mouse position ──
area.addEventListener('wheel',e=>{
  e.preventDefault();
  const rect=area.getBoundingClientRect();
  const mx=e.clientX-rect.left, my=e.clientY-rect.top; // mouse in area space
  const factor=e.deltaY<0?1.12:1/1.12;
  const newZoom=Math.max(0.05,Math.min(30,vZoom*factor));
  // adjust offset so point under mouse stays fixed
  const ratio=newZoom/vZoom;
  vOffX=mx-(mx-vOffX)*ratio;
  vOffY=my-(my-vOffY)*ratio;
  vZoom=newZoom;
  applyViewport();
},{passive:false});

// ── Pan: right-click drag / pen barrel-button drag / middle-click drag ──
let panDown=false, panStartX=0, panStartY=0, panOffX0=0, panOffY0=0;
let panPointerId=null;

function isPanTrigger(e){
  // Right mouse button
  if(e.button===2) return true;
  // Middle mouse button
  if(e.button===1) return true;
  // Pen barrel button (button 5 on some tablets, or buttons bitmask 32)
  if(e.pointerType==='pen' && (e.button===2 || e.button===5)) return true;
  return false;
}

area.addEventListener('pointerdown',e=>{
  if(isPanTrigger(e)){
    e.preventDefault();
    panDown=true;
    panPointerId=e.pointerId;
    area.setPointerCapture(e.pointerId);
    panStartX=e.clientX; panStartY=e.clientY;
    panOffX0=vOffX; panOffY0=vOffY;
    area.style.cursor='grab';
  }
});
window.addEventListener('pointermove',e=>{
  if(panDown && (e.pointerId===panPointerId || panPointerId===null)){
    vOffX=panOffX0+(e.clientX-panStartX);
    vOffY=panOffY0+(e.clientY-panStartY);
    applyViewport();
    area.style.cursor='grabbing';
    return;
  }
  // Handle tx drag when pointer leaves cTop
  if(txDragging&&tool==='move'){
    const[rx,ry]=getPos(e);
    txOnMove(rx,ry);
  }
});
window.addEventListener('pointerup',e=>{
  if(panDown && (e.pointerId===panPointerId || panPointerId===null)){
    panDown=false; panPointerId=null; area.style.cursor='';
  }
  if((e.button===0 || e.pointerType==='pen')&&txDragging){txOnUp();}
  if(symDrag&&e.button===0){symDrag=null; updateCursor();}
});
area.addEventListener('contextmenu',e=>e.preventDefault());

const MAX_LAYERS=20;
const layerMeta=[
  {name:'layer 1', visible:true, opacity:1, blendMode:'source-over'}
];
let curLayer=0;
let frames=[Array(1).fill(null)], fillFrames=[Array(1).fill(null)], cur=0;
let frameHolds=[1];
let tool='pencil',brushSize=4,brushOpacity=0.9,brushColor='#222222';
let smoothBuffer=[]; // collects all raw points during a stroke for bezier fitting
let drawing=false,lx=0,ly=0,startX=0,startY=0;
let showOnion=true,fps=12,playing=false,playIv=null,playTick=0,playTickCount=0;
let tlZoom=1; // timeline zoom: 1=normal, >1=bigger frames
const undoStacks=[[]],redoStacks=[[]];
let symmetry='none', symX=CW/2, symY=CH/2;
let stabLevel=0,stabBuffer=[];
let showGrid=false,gridSize=40;

function setSymPos(x,y){
  symX=Math.max(0,Math.min(CW,Math.round(x)));
  symY=Math.max(0,Math.min(CH,Math.round(y)));
  document.getElementById('sym-x-in').value=symX;
  document.getElementById('sym-y-in').value=symY;
  drawSymGuide();
}
function resetSymPos(){setSymPos(CW/2,CH/2);}

function setSymmetry(s){
  symmetry=s;
  ['none','h','v','4'].forEach(k=>{
    const el=document.getElementById('btn-sym-'+k);
    if(el) el.classList.toggle('on',k===s);
  });
  // Show/hide position inputs and labels
  const posEl=document.getElementById('sym-pos');
  posEl.style.display=s==='none'?'none':'flex';
  // Show X input for H/4, Y input for V/4
  const lx=document.getElementById('sym-lbl-x');
  const ix=document.getElementById('sym-x-in');
  const ly=document.getElementById('sym-lbl-y');
  const iy=document.getElementById('sym-y-in');
  lx.style.display=(s==='h'||s==='4')?'':'none';
  ix.style.display=(s==='h'||s==='4')?'':'none';
  ly.style.display=(s==='v'||s==='4')?'':'none';
  iy.style.display=(s==='v'||s==='4')?'':'none';
  drawSymGuide();
}

function drawSymGuide(){
  ctxSym.clearRect(0,0,CW,CH);
  if(symmetry==='none') return;
  ctxSym.save();
  ctxSym.lineCap='round';

  // ── Helper: draw one axis line with handles ───────────────────
  function drawAxis(isVertical, pos, color){
    const x1=isVertical?pos:0,   y1=isVertical?0:pos;
    const x2=isVertical?pos:CW,  y2=isVertical?CH:pos;
    const mx=isVertical?pos:CW/2, my=isVertical?CH/2:pos;

    // Shadow for contrast against any background
    ctxSym.lineWidth=3;
    ctxSym.strokeStyle='rgba(0,0,0,0.25)';
    ctxSym.setLineDash([]);
    ctxSym.beginPath();ctxSym.moveTo(x1,y1);ctxSym.lineTo(x2,y2);ctxSym.stroke();

    // Main dashed line
    ctxSym.lineWidth=1.5;
    ctxSym.strokeStyle=color;
    ctxSym.setLineDash([10,6]);
    ctxSym.beginPath();ctxSym.moveTo(x1,y1);ctxSym.lineTo(x2,y2);ctxSym.stroke();

    ctxSym.setLineDash([]);

    // Center drag handle — diamond shape
    const hs=10;
    ctxSym.fillStyle=color;
    ctxSym.strokeStyle='rgba(0,0,0,0.4)';
    ctxSym.lineWidth=1.5;
    ctxSym.beginPath();
    ctxSym.moveTo(mx,my-hs);
    ctxSym.lineTo(mx+hs,my);
    ctxSym.lineTo(mx,my+hs);
    ctxSym.lineTo(mx-hs,my);
    ctxSym.closePath();
    ctxSym.fill();ctxSym.stroke();

    // Arrow tips at both ends
    function arrowTip(ax,ay,dirX,dirY){
      const as=8;
      ctxSym.fillStyle=color;
      ctxSym.beginPath();
      ctxSym.moveTo(ax+dirX*as, ay+dirY*as);
      ctxSym.lineTo(ax-dirY*as*0.5, ay+dirX*as*0.5);
      ctxSym.lineTo(ax+dirY*as*0.5, ay-dirX*as*0.5);
      ctxSym.closePath();ctxSym.fill();
    }
    if(isVertical){
      arrowTip(pos,12, 0,1);
      arrowTip(pos,CH-12, 0,-1);
    } else {
      arrowTip(12,pos, 1,0);
      arrowTip(CW-12,pos, -1,0);
    }

    // Position label
    ctxSym.font='bold 11px monospace';
    ctxSym.fillStyle=color;
    ctxSym.strokeStyle='rgba(0,0,0,0.5)';
    ctxSym.lineWidth=3;
    ctxSym.textAlign='left';ctxSym.textBaseline='top';
    const label=isVertical?`x:${Math.round(pos)}`:`y:${Math.round(pos)}`;
    const lx2=isVertical?pos+6:6;
    const ly2=isVertical?6:pos+4;
    ctxSym.strokeText(label,lx2,ly2);
    ctxSym.fillText(label,lx2,ly2);
  }

  if(symmetry==='h'||symmetry==='4') drawAxis(true,  symX, 'rgba(80,180,255,0.9)');
  if(symmetry==='v'||symmetry==='4') drawAxis(false, symY, 'rgba(255,160,80,0.9)');

  ctxSym.restore();
}

// ── Sym line drag ─────────────────────────────────────────────────
let symDrag=null; // 'h' or 'v' or null

function symHitTest(x,y){
  if(symmetry==='none') return null;
  const HIT=16; // hit radius around diamond center in canvas px
  // Diamond for H mirror is at (symX, CH/2)
  if(symmetry==='h'||symmetry==='4'){
    const dx=Math.abs(x-symX), dy=Math.abs(y-CH/2);
    if(dx+dy<=HIT) return 'h'; // rotated-square (diamond) hit test
  }
  // Diamond for V mirror is at (CW/2, symY)
  if(symmetry==='v'||symmetry==='4'){
    const dx=Math.abs(x-CW/2), dy=Math.abs(y-symY);
    if(dx+dy<=HIT) return 'v';
  }
  return null;
}

// symDrag mousemove is handled inside onMove (cTop mousemove)
// Only need window-level mouseup to clean up symDrag if mouse released outside canvas
window.addEventListener('mouseup',e2=>{
  if(symDrag){symDrag=null; updateCursor();}
});

// ── Old palette system replaced ──

function openSettings(){
  alert("Panel Pengaturan Khusus (Tema, Pintasan, Pilihan Proyek) sedang dalam tahap pengembangan dan akan dirilis pada iterasi selanjutnya! 🙏");
}

function loadReferenceImage(e){
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      const cRef = document.getElementById('c-ref');
      if(!cRef) return;
      const ctx = cRef.getContext('2d');
      ctx.clearRect(0,0,CW,CH);
      
      const scale = Math.min(CW / img.width, CH / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      const x = (CW - w) / 2;
      const y = (CH - h) / 2;
      
      ctx.drawImage(img, x, y, w, h);
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
}

// Auto-save disabled for stroke (handled explicitly)
function autoSaveColor(){
  // Kept empty to avoid errors from legacy calls
}
let lassoPoints=[],lassoActive=false,lassoMask=null,lassoImgData=null,lassoDrag=false,lassoDragStart=null,lassoDragOrigin=null;

// ── Move / Transform tool state ───────────────────────────────────
let txActive=false;
let txBounds=null;
let txCenterX=0,txCenterY=0;
let txOffsetX=0,txOffsetY=0;
let txRotation=0;
let txScale=100;
let txSnapshot=null;
let txBackground=null;
let txMask=null;
let txOriginalLassoPoints=null; // snapshot of lassoPoints at activateTransform
let txDragging=false;
let txDragStart=null;
let txDragOriginCenter=null;
let txDragOriginOffset=null;
let txHandle=null;
const TX_HANDLE_R=10;

function getBoundingBox(mask){
  const d=mask.data;
  let minX=CW,minY=CH,maxX=0,maxY=0;
  for(let y=0;y<CH;y++){
    for(let x=0;x<CW;x++){
      if(d[(y*CW+x)*4+3]>0){
        if(x<minX)minX=x;if(x>maxX)maxX=x;
        if(y<minY)minY=y;if(y>maxY)maxY=y;
      }
    }
  }
  return{x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1};
}

function activateTransform(){
  if(!lassoActive||!lassoMask||!lassoImgData)return;
  // Push undo ONCE before any transform — so undo cancels the whole transform
  pushUndo();
  txActive=true;
  txMask=lassoMask;
  txSnapshot={
    ink:layerCtxs[curLayer].getImageData(0,0,CW,CH),
    fill:fillCtxs[curLayer].getImageData(0,0,CW,CH)
  };
  // Build background snapshot: canvas with selection pixels erased
  // Used by txOnUp to detect where selection moved after each drag
  const md=txMask.data;
  const bgInk=new ImageData(new Uint8ClampedArray(txSnapshot.ink.data),CW,CH);
  const bgFill=new ImageData(new Uint8ClampedArray(txSnapshot.fill.data),CW,CH);
  for(let i=0;i<CW*CH;i++){
    if(md[i*4+3]>0){
      if(bgInk.data[i*4+3]>0){ bgInk.data[i*4]=0;bgInk.data[i*4+1]=0;bgInk.data[i*4+2]=0;bgInk.data[i*4+3]=0; }
      if(bgFill.data[i*4+3]>0){ bgFill.data[i*4]=0;bgFill.data[i*4+1]=0;bgFill.data[i*4+2]=0;bgFill.data[i*4+3]=0; }
    }
  }
  txBackground={ink:bgInk, fill:bgFill};
  txBounds=getBoundingBox(txMask);
  txCenterX=txBounds.x+txBounds.w/2;
  txCenterY=txBounds.y+txBounds.h/2;
  txOffsetX=0; txOffsetY=0;
  txRotation=0; txScale=100;
  // Snapshot lasso outline so we can transform it in sync with the object
  txOriginalLassoPoints=lassoPoints.map(p=>[...p]);
  document.getElementById('tx-rot').value=0;
  document.getElementById('tx-scale').value=100;
  const tc=document.getElementById('transform-controls');
  if(tc) tc.style.display='flex';
  document.getElementById('sel-toolbar').style.display='flex';
  drawTransformHandles();
}

function deactivateTransform(){
  txActive=false;txHandle=null;txDragging=false;
  txSnapshot=null;txBackground=null;txMask=null;txBounds=null;
  txOriginalLassoPoints=null;
  document.getElementById('transform-controls').style.display='none';
  ctxTransform.clearRect(0,0,CW,CH);
}

function drawTransformHandles(){
  ctxTransform.clearRect(0,0,CW,CH);
  if(!txActive||!txBounds)return;

  const px=txCenterX, py=txCenterY;
  const ox=txOffsetX, oy=txOffsetY;
  const rot=txRotation*Math.PI/180;
  const sc=txScale/100;
  const hw=txBounds.w/2*sc, hh=txBounds.h/2*sc;

  // Original bbox center (before any transform)
  const origCx=txBounds.x+txBounds.w/2;
  const origCy=txBounds.y+txBounds.h/2;

  // After T(ox,oy)·T(px,py)·R·S·T(-px,-py), bbox center moves to:
  // Relative to pivot:
  const dx0=origCx-px, dy0=origCy-py;
  const rotDx=(dx0*Math.cos(rot)-dy0*Math.sin(rot))*sc;
  const rotDy=(dx0*Math.sin(rot)+dy0*Math.cos(rot))*sc;
  // Add offset
  const bCx=ox+px+rotDx;
  const bCy=oy+py+rotDy;

  ctxTransform.save();
  ctxTransform.translate(bCx, bCy);
  ctxTransform.rotate(rot);

  // Dashed bounding box
  ctxTransform.strokeStyle='rgba(80,180,255,0.9)';
  ctxTransform.lineWidth=1;
  ctxTransform.setLineDash([6,4]);
  ctxTransform.strokeRect(-hw,-hh,hw*2,hh*2);
  ctxTransform.setLineDash([]);

  // Corner handles (scale)
  const corners=[[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh]];
  ctxTransform.fillStyle='rgba(255,255,255,0.9)';
  ctxTransform.strokeStyle='rgba(80,180,255,1)';
  ctxTransform.lineWidth=1.5;
  corners.forEach(([cx2,cy2])=>{
    ctxTransform.beginPath();
    ctxTransform.rect(cx2-TX_HANDLE_R/2,cy2-TX_HANDLE_R/2,TX_HANDLE_R,TX_HANDLE_R);
    ctxTransform.fill();ctxTransform.stroke();
  });

  // Rotation handle
  const rotHandleY=-hh-30;
  ctxTransform.beginPath();
  ctxTransform.moveTo(0,-hh);ctxTransform.lineTo(0,rotHandleY);
  ctxTransform.strokeStyle='rgba(80,180,255,0.7)';ctxTransform.lineWidth=1;ctxTransform.stroke();
  ctxTransform.beginPath();ctxTransform.arc(0,rotHandleY,TX_HANDLE_R,0,Math.PI*2);
  ctxTransform.fillStyle='rgba(255,200,50,0.9)';ctxTransform.fill();
  ctxTransform.strokeStyle='rgba(200,150,0,1)';ctxTransform.lineWidth=1.5;ctxTransform.stroke();
  ctxTransform.restore();

  // Pivot crosshair at its own position (not offset, not rotated)
  ctxTransform.save();
  ctxTransform.translate(px, py);
  // Outer ring
  ctxTransform.beginPath();ctxTransform.arc(0,0,10,0,Math.PI*2);
  ctxTransform.strokeStyle='rgba(255,80,80,0.5)';ctxTransform.lineWidth=1;ctxTransform.stroke();
  // Crosshair
  ctxTransform.strokeStyle='rgba(255,80,80,1)';ctxTransform.lineWidth=1.5;
  ctxTransform.beginPath();ctxTransform.moveTo(-12,0);ctxTransform.lineTo(12,0);ctxTransform.stroke();
  ctxTransform.beginPath();ctxTransform.moveTo(0,-12);ctxTransform.lineTo(0,12);ctxTransform.stroke();
  // Centre dot
  ctxTransform.beginPath();ctxTransform.arc(0,0,5,0,Math.PI*2);
  ctxTransform.fillStyle='rgba(255,80,80,0.9)';ctxTransform.fill();
  ctxTransform.strokeStyle='rgba(255,255,255,0.9)';ctxTransform.lineWidth=1.5;ctxTransform.stroke();
  ctxTransform.restore();

  // Dashed line from pivot to bbox center
  ctxTransform.save();
  ctxTransform.strokeStyle='rgba(255,100,100,0.3)';ctxTransform.lineWidth=1;
  ctxTransform.setLineDash([4,4]);
  ctxTransform.beginPath();ctxTransform.moveTo(px,py);ctxTransform.lineTo(bCx,bCy);ctxTransform.stroke();
  ctxTransform.setLineDash([]);
  ctxTransform.restore();
}

function txHitTest(x,y){
  if(!txActive||!txBounds)return null;
  const px=txCenterX, py=txCenterY;
  const ox=txOffsetX, oy=txOffsetY;
  const rot=txRotation*Math.PI/180;
  const sc=txScale/100;

  // Current bbox center (with offset applied)
  const origCx=txBounds.x+txBounds.w/2;
  const origCy=txBounds.y+txBounds.h/2;
  const dx0=origCx-px, dy0=origCy-py;
  const bCx=ox+px+(dx0*Math.cos(rot)-dy0*Math.sin(rot))*sc;
  const bCy=oy+py+(dx0*Math.sin(rot)+dy0*Math.cos(rot))*sc;
  const hw=txBounds.w/2*sc, hh=txBounds.h/2*sc;

  // 1. PIVOT — checked FIRST, radius in canvas px adjusted for zoom
  //    12 screen px → 12/scale canvas px, so it's always comfortably clickable
  const pivotHitR = Math.max(8, 14/scale);
  const pdx=x-px, pdy=y-py;
  if(Math.sqrt(pdx*pdx+pdy*pdy)<pivotHitR) return 'pivot';

  // Rotate test point into bbox-local space
  const dx=x-bCx, dy=y-bCy;
  const lx=(dx*Math.cos(-rot)-dy*Math.sin(-rot));
  const ly=(dx*Math.sin(-rot)+dy*Math.cos(-rot));

  // 2. Rotation handle (above top edge, outside bbox)
  if(Math.abs(lx)<TX_HANDLE_R*1.5 && Math.abs(ly-(-hh-30))<TX_HANDLE_R*1.5) return 'rotate';

  // 3. Corner scale handles
  const corners=[[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh]];
  for(const[ccx,ccy] of corners){
    if(Math.abs(lx-ccx)<TX_HANDLE_R && Math.abs(ly-ccy)<TX_HANDLE_R) return 'scale';
  }

  // 4. Inside bbox = MOVE
  if(lx>=-hw && lx<=hw && ly>=-hh && ly<=hh) return 'move';

  return null;
}

function setTransformRot(deg){
  txRotation=deg;
  applyTransformPreview();
  updateLassoFromTransform();
  drawTransformHandles();
}
function setTransformScale(pct){
  txScale=Math.max(1,pct);
  applyTransformPreview();
  updateLassoFromTransform();
  drawTransformHandles();
}

function applyTransformPreview(){
  if(!txActive||!txSnapshot||!txMask)return;
  const md=txMask.data;
  const sc=txScale/100;
  const rot=txRotation*Math.PI/180;
  const px=txCenterX, py=txCenterY;
  const ox=txOffsetX, oy=txOffsetY;

  function transformCanvas(ctx, snapData){
    const snap=snapData.data;

    // Step 1: restore full snapshot
    ctx.putImageData(snapData,0,0);

    // Step 2: erase original selection pixels
    const cur=ctx.getImageData(0,0,CW,CH);
    const dd=cur.data;
    for(let i=0;i<CW*CH;i++){
      if(md[i*4+3]>0 && snap[i*4+3]>0){
        dd[i*4]=0;dd[i*4+1]=0;dd[i*4+2]=0;dd[i*4+3]=0;
      }
    }
    ctx.putImageData(cur,0,0);

    // Step 3: extract selection pixels into temp canvas
    const tmp=document.createElement('canvas');tmp.width=CW;tmp.height=CH;
    const tx2=tmp.getContext('2d');
    const sel=new ImageData(CW,CH);
    for(let i=0;i<CW*CH;i++){
      if(md[i*4+3]>0 && snap[i*4+3]>0){
        sel.data[i*4  ]=snap[i*4];
        sel.data[i*4+1]=snap[i*4+1];
        sel.data[i*4+2]=snap[i*4+2];
        sel.data[i*4+3]=snap[i*4+3];
      }
    }
    tx2.putImageData(sel,0,0);

    // Step 4: apply transform
    // Transform order: translate by offset, then rotate+scale around pivot
    // Matrix: T(ox,oy) · T(px,py) · R(rot) · S(sc) · T(-px,-py) · pixels
    ctx.save();
    ctx.translate(ox, oy);           // move offset
    ctx.translate(px, py);           // move to pivot
    ctx.rotate(rot);                  // rotate around pivot
    ctx.scale(sc, sc);               // scale around pivot
    ctx.translate(-px, -py);         // move back from pivot
    ctx.drawImage(tmp, 0, 0);
    ctx.restore();
  }

  transformCanvas(layerCtxs[curLayer], txSnapshot.ink);
  transformCanvas(fillCtxs[curLayer],  txSnapshot.fill);
}

function applyTransform(){
  if(!txActive)return;
  // Canvas already has the correct transformed pixels from applyTransformPreview
  // Just save and exit — undo was already pushed at activateTransform
  saveFrame();
  deactivateTransform();
  deselect();
  rebuildThumbs();
}

function cancelTransform(){
  // Cancel = restore original canvas (before transform), pop the undo we pushed
  if(!txActive||!txSnapshot)return;
  layerCtxs[curLayer].putImageData(txSnapshot.ink,0,0);
  fillCtxs[curLayer].putImageData(txSnapshot.fill,0,0);
  // Remove the undo entry we pushed at activateTransform
  if(undoStacks[cur]&&undoStacks[cur].length>0) undoStacks[cur].pop();
  saveFrame();
  deactivateTransform();
  deselect();
  rebuildThumbs();
  updateUndoBtn();
}

// Move tool interaction
function txOnDown(x,y){
  const hit=txHitTest(x,y);
  if(!hit){
    applyTransform();
    return true;
  }
  txDragging=true;
  txHandle=hit;
  txDragStart={x,y,rot:txRotation,scale:txScale};
  txDragOriginCenter={x:txCenterX,y:txCenterY};
  txDragOriginOffset={x:txOffsetX,y:txOffsetY};
  return true;
}

function txOnMove(x,y){
  if(!txDragging||!txDragStart)return;
  const dx=x-txDragStart.x, dy=y-txDragStart.y;

  if(txHandle==='move'){
    // Move object — update offset, pivot stays fixed
    txOffsetX=txDragOriginOffset.x+dx;
    txOffsetY=txDragOriginOffset.y+dy;

  } else if(txHandle==='pivot'){
    // Move pivot point only — object doesn't move visually
    txCenterX=txDragOriginCenter.x+dx;
    txCenterY=txDragOriginCenter.y+dy;
    updateLassoFromTransform();
    drawTransformHandles();
    return; // pivot move doesn't change pixel data

  } else if(txHandle==='rotate'){
    // Rotate around pivot
    const ang=Math.atan2(y-txCenterY, x-txCenterX)*180/Math.PI+90;
    txRotation=Math.round(ang);
    document.getElementById('tx-rot').value=txRotation;

  } else if(txHandle==='scale'){
    // Scale around pivot
    const d0=Math.sqrt(
      (txDragStart.x-txCenterX)**2+
      (txDragStart.y-txCenterY)**2
    )||1;
    const d1=Math.sqrt((x-txCenterX)**2+(y-txCenterY)**2);
    txScale=Math.max(5,Math.round(txDragStart.scale*d1/d0));
    document.getElementById('tx-scale').value=txScale;
  }

  applyTransformPreview();
  updateLassoFromTransform();
  drawTransformHandles();
}

// Update lassoPoints to reflect current transform state so selection overlay follows the object
function updateLassoFromTransform(){
  if(!txActive||!txBounds||!lassoMask)return;
  const px=txCenterX, py=txCenterY;
  const ox=txOffsetX, oy=txOffsetY;
  const rot=txRotation*Math.PI/180;
  const sc=txScale/100;
  const origCx=txBounds.x+txBounds.w/2;
  const origCy=txBounds.y+txBounds.h/2;

  // Transform each lasso point using same matrix as applyTransformPreview:
  // T(ox,oy) · T(px,py) · R(rot) · S(sc) · T(-px,-py) · point
  // But lassoPoints are in original canvas space, so apply same transform:
  // new_pt = offset + pivot + R·S·(orig_pt - pivot)
  if(!txOriginalLassoPoints) return;
  lassoPoints = txOriginalLassoPoints.map(([x,y])=>{
    const dx=x-px, dy=y-py;
    const rx=dx*Math.cos(rot)-dy*Math.sin(rot);
    const ry=dx*Math.sin(rot)+dy*Math.cos(rot);
    return [ox+px+rx*sc, oy+py+ry*sc];
  });
  drawLassoPreview();
}

function txOnUp(){
  if(!txDragging) return;
  txDragging=false;
  txHandle=null;
  txDragStart=null;
  txDragOriginCenter=null;
  txDragOriginOffset=null;
  if(!txActive) return;

  // Bake current state into snapshot so next drag starts fresh
  txSnapshot={
    ink:  layerCtxs[curLayer].getImageData(0,0,CW,CH),
    fill: fillCtxs[curLayer].getImageData(0,0,CW,CH)
  };

  // Update txMask by diffing new snapshot against background
  if(txBackground){
    const bgD=txBackground.ink.data, bgF=txBackground.fill.data;
    const inkS=txSnapshot.ink.data, fillS=txSnapshot.fill.data;
    const newMask=new ImageData(CW,CH); const nm=newMask.data;
    for(let i=0;i<CW*CH;i++){
      const p=i*4;
      const dI=inkS[p+3]!==bgD[p+3]||inkS[p]!==bgD[p]||inkS[p+1]!==bgD[p+1]||inkS[p+2]!==bgD[p+2];
      const dF=fillS[p+3]!==bgF[p+3]||fillS[p]!==bgF[p]||fillS[p+1]!==bgF[p+1]||fillS[p+2]!==bgF[p+2];
      if(dI||dF){nm[p]=255;nm[p+1]=255;nm[p+2]=255;nm[p+3]=255;}
    }
    txMask=newMask;
    txBounds=getBoundingBox(txMask);
  }

  // Reset offset and rotation/scale — already baked into snapshot
  txOffsetX=0; txOffsetY=0;
  txRotation=0; txScale=100;
  document.getElementById('tx-rot').value=0;
  document.getElementById('tx-scale').value=100;

  // Re-snapshot lasso outline at new position for next drag
  txOriginalLassoPoints=lassoPoints.map(p=>[...p]);
  drawTransformHandles();
}

function setFrameHold(idx,v){while(frameHolds.length<=idx)frameHolds.push(1);frameHolds[idx]=v;rebuildTimingGrid();rebuildThumbs();}
function getHold(idx){return(frameHolds[idx]||1);}
function hexToRgba(hex,a){const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);return`rgba(${r},${g},${b},${a})`;}
function hexToRgb(hex){return[parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)];}
function getPos(e){
  // Support PointerEvent, MouseEvent, and TouchEvent
  const src=(e.touches && e.touches.length > 0) ? e.touches[0] : e;
  const rect=area.getBoundingClientRect();
  const ax=src.clientX-rect.left, ay=src.clientY-rect.top;
  const lx2=ax-vOffX, ly2=ay-vOffY;
  const rad=-vRotate*Math.PI/180;
  const rx=lx2*Math.cos(rad)-ly2*Math.sin(rad);
  const ry=lx2*Math.sin(rad)+ly2*Math.cos(rad);
  return[rx/scale, ry/scale];
}

let activeShape='rect'; // currently selected shape

function toggleShapeMenu(){
  const m=document.getElementById('shape-menu');
  m.classList.toggle('open');
}
function pickShape(s){
  activeShape=s;
  setTool(s);
  document.getElementById('shape-menu').classList.remove('open');
  // Update icon in trigger button
  const icons={
    line:'<line x1="5" y1="19" x2="19" y2="5"/>',
    rect:'<rect x="3" y="3" width="18" height="18" rx="2"/>',
    ellipse:'<ellipse cx="12" cy="12" rx="9" ry="6"/>',
    triangle:'<polygon points="12,4 21,20 3,20"/>',
    star:'<polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/>',
    arrow:'<line x1="5" y1="12" x2="19" y2="12"/><polyline points="13,6 19,12 13,18"/>'
  };
  document.getElementById('shape-icon').innerHTML=icons[s]||icons.rect;
  document.querySelectorAll('.shape-item').forEach(el=>el.classList.remove('active-shape'));
  const si=document.getElementById('si-'+s);if(si)si.classList.add('active-shape');
}

// Close dropdown menus on outside click
document.addEventListener('click',e=>{
  if(!e.target.closest('#shape-dropdown'))
    document.getElementById('shape-menu').classList.remove('open');
  if(!e.target.closest('#fill-dropdown'))
    document.getElementById('fill-menu').style.display='none';
  if(!e.target.closest('#workspace-wrap')){
    const wm=document.getElementById('workspace-menu');
    if(wm)wm.style.display='none';
  }
  if(!e.target.closest('#palette-wrap')){
    const pm=document.getElementById('palette-menu');
    if(pm && e.target.closest('.tbtn[onclick="togglePaletteMenu()"]')===null) pm.style.display='none';
  }
});

function toggleFillMenu(){
  setTool('fill');
  const m=document.getElementById('fill-menu');
  m.style.display=m.style.display==='flex'?'none':'flex';
}

let uiLocked=true;
function toggleWorkspaceMenu(){
  const m=document.getElementById('workspace-menu');
  m.style.display=m.style.display==='flex'?'none':'flex';
}
function toggleUILock(){
  uiLocked=!uiLocked;
  document.getElementById('lock-icon').textContent=uiLocked?'🔒':'🔓';
  document.getElementById('lock-text').textContent=uiLocked?'Unlock UI':'Lock UI';
  const app=document.getElementById('app');
  if(uiLocked) app.classList.add('ui-locked');
  else app.classList.remove('ui-locked');
  document.getElementById('workspace-menu').style.display='none';
}
function resetUI(){
  const tb=document.getElementById('toolbar');
  if(tb){tb.style.left='20px';tb.style.top='10px';}
  const sel=document.getElementById('sel-toolbar');
  if(sel){sel.style.left='20px';sel.style.top='60px';}
  if(!uiLocked) toggleUILock();
  document.getElementById('workspace-menu').style.display='none';
  showToast('Workspace reset');
}

function pickFillMode(mode){
  fillMode=mode;
  // Update active highlight
  ['fill','stroke','both'].forEach(k=>{
    const el=document.getElementById('fi-'+k);
    if(el) el.classList.toggle('active-shape', k===mode);
  });
  // Update fill button icon to reflect mode
  const icons={
    fill:'<path d="M8 3v6l-5 5a2 2 0 0 0 0 2.83l3.17 3.17a2 2 0 0 0 2.83 0L19 10"/><path d="M8 9h8"/><circle cx="19.5" cy="18.5" r="2.5"/>',
    stroke:'<path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" stroke-width="2"/>',
    both:'<path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><circle cx="6" cy="18" r="4" fill="currentColor" opacity=".5" stroke="none"/>'
  };
  document.getElementById('fill-icon').innerHTML=icons[mode]||icons.fill;
  // Close menu but keep fill tool active
  document.getElementById('fill-menu').style.display='none';
}

function updateCursor(){
  if(symDrag) return; // don't override sym drag cursor
  if(panDown) return;

  if(tool==='pencil'||tool==='rough'||tool==='eraser'){
    // Draw a circle cursor sized to the brush
    // eraser is 2x brush size
    const r=Math.max(1, tool==='eraser' ? brushSize : brushSize/2);
    // Clamp display radius — very large brushes just show a ring
    const dr=Math.min(r*scale, 96);
    const size=Math.round(dr*2+8); // canvas size with padding
    const cx=size/2, cy=size/2;

    let inner='', color='';
    if(tool==='eraser'){
      // White circle with dark border
      inner=`<circle cx="${cx}" cy="${cy}" r="${dr}" fill="rgba(255,255,255,0.15)" stroke="rgba(0,0,0,0.8)" stroke-width="1.5"/>
             <circle cx="${cx}" cy="${cy}" r="${dr}" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="1" stroke-dasharray="3 3"/>`;
    } else if(tool==='rough'){
      // Jagged dashed circle for rough
      inner=`<circle cx="${cx}" cy="${cy}" r="${dr}" fill="none" stroke="${brushColor}" stroke-width="1.5" stroke-dasharray="4 3" opacity="0.85"/>
             <circle cx="${cx}" cy="${cy}" r="2" fill="${brushColor}" opacity="0.9"/>`;
    } else {
      // Solid circle for pencil
      inner=`<circle cx="${cx}" cy="${cy}" r="${dr}" fill="none" stroke="${brushColor}" stroke-width="1.5" opacity="0.85"/>
             <circle cx="${cx}" cy="${cy}" r="1.5" fill="${brushColor}" opacity="0.9"/>`;
    }
    // Add crosshair lines through center
    inner+=`<line x1="${cx-4}" y1="${cy}" x2="${cx+4}" y2="${cy}" stroke="rgba(255,255,255,0.6)" stroke-width="1"/>
            <line x1="${cx}" y1="${cy-4}" x2="${cx}" y2="${cy+4}" stroke="rgba(255,255,255,0.6)" stroke-width="1"/>`;

    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${inner}</svg>`;
    const encoded='data:image/svg+xml;base64,'+btoa(svg);
    cTop.style.cursor=`url('${encoded}') ${cx} ${cy}, crosshair`;
  } else if(tool==='fill'){
    cTop.style.cursor='cell';
  } else if(tool==='eraser'){
    cTop.style.cursor='not-allowed';
  } else if(tool==='lasso'){
    cTop.style.cursor='crosshair';
  } else {
    cTop.style.cursor='crosshair';
  }
}

function setTool(t){
  // Apply (commit) transform if switching away from move tool
  if(tool==='move'&&t!=='move'&&txActive) applyTransform();
  // Deselect lasso ONLY when switching to drawing tools (not fill/gradient/text which use selection)
  const keepSelection=new Set(['move','fill','gradient','text','lasso']);
  if(tool==='lasso'&&!keepSelection.has(t)) deselect();
  // Hint when gradient activated
  if(t==='gradient'){
    if(lassoActive) showToast('Gradient: drag inside selection');
    else showToast('Gradient: select area first, or drag for full layer');
  }
  tool=t;
  document.querySelectorAll('.tbtn').forEach(b=>b.classList.remove('on'));
  const el=document.getElementById('btn-'+t);if(el)el.classList.add('on');
  if(t==='fill') document.getElementById('btn-fill').classList.add('on');
  if(shapeTools.has(t)) document.getElementById('btn-shape').classList.add('on');
  if(showOnion)document.getElementById('btn-onion').classList.add('on');
  document.getElementById('btn-sym-'+symmetry).classList.add('on');
  if(showGrid)document.getElementById('btn-grid').classList.add('on');
  document.getElementById('sel-toolbar').style.display=(t==='lasso'||t==='move')?'flex':'none';
  const tc=document.getElementById('transform-controls');
  if(tc) tc.style.display=(t==='move'&&txActive)?'flex':'none';
  updateCursor();
}

function setSymmetry(s){
  symmetry=s;
  ['none','h','v','4'].forEach(k=>{const el=document.getElementById('btn-sym-'+k);if(el)el.classList.toggle('on',k===s);});
  drawSymGuide();
}

function toggleGrid(){showGrid=!showGrid;document.getElementById('btn-grid').classList.toggle('on',showGrid);drawGrid();}

function drawGrid(){
  ctxGrid.clearRect(0,0,CW,CH);if(!showGrid)return;
  ctxGrid.save();ctxGrid.strokeStyle='rgba(100,160,255,0.18)';ctxGrid.lineWidth=1;
  for(let x=0;x<=CW;x+=gridSize){ctxGrid.beginPath();ctxGrid.moveTo(x,0);ctxGrid.lineTo(x,CH);ctxGrid.stroke();}
  for(let y=0;y<=CH;y+=gridSize){ctxGrid.beginPath();ctxGrid.moveTo(0,y);ctxGrid.lineTo(CW,y);ctxGrid.stroke();}
  ctxGrid.strokeStyle='rgba(100,160,255,0.35)';
  ctxGrid.beginPath();ctxGrid.moveTo(CW/2,0);ctxGrid.lineTo(CW/2,CH);ctxGrid.stroke();
  ctxGrid.beginPath();ctxGrid.moveTo(0,CH/2);ctxGrid.lineTo(CW,CH/2);ctxGrid.stroke();
  ctxGrid.restore();
}

function toggleOnion(){showOnion=!showOnion;document.getElementById('btn-onion').classList.toggle('on',showOnion);drawOnion();}
function getActiveCtx(){return layerCtxs[curLayer];}

let onionFramesBack=1, onionFramesFwd=1;
function setOnionFrames(){
  onionFramesBack=Math.max(1,Math.min(5,+document.getElementById('onion-back').value||1));
  onionFramesFwd=Math.max(0,Math.min(5,+document.getElementById('onion-fwd').value||1));
  drawOnion();
}
function toggleOnionMenu(){
  const m=document.getElementById('onion-menu');
  m.style.display=m.style.display==='flex'?'none':'flex';
}
document.addEventListener('click',e=>{
  if(!e.target.closest('#onion-wrap'))
    document.getElementById('onion-menu').style.display='none';
});

function drawOnion(){
  ctxPrev.clearRect(0,0,CW,CH);ctxNext.clearRect(0,0,CW,CH);
  if(!showOnion)return;

  const baseOp=(+document.getElementById('onion-opacity').value||30)/100;
  const prevColor=document.getElementById('onion-prev-color').value||'#ff4444';
  const nextColor=document.getElementById('onion-next-color').value||'#44aaff';

  function hexToRgbOnion(hex){
    return[parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)];
  }

  function blendFrameOnion(frameIdx,dstCtx,tintColor,opacity){
    if(frameIdx<0||frameIdx>=frames.length) return;
    const fArr=frames[frameIdx], fillArr=fillFrames[frameIdx];
    if(!fArr) return;
    const tmp=document.createElement('canvas');tmp.width=CW;tmp.height=CH;
    const tx=tmp.getContext('2d');
    for(let i=0;i<layerMeta.length;i++){
      if(!layerMeta[i]||!layerMeta[i].visible) continue;
      if(fillArr&&fillArr[i]){const t=document.createElement('canvas');t.width=CW;t.height=CH;t.getContext('2d').putImageData(fillArr[i],0,0);tx.drawImage(t,0,0);}
      if(fArr[i]){const t=document.createElement('canvas');t.width=CW;t.height=CH;t.getContext('2d').putImageData(fArr[i],0,0);tx.drawImage(t,0,0);}
    }
    // Apply tint color overlay
    const imgd=tx.getImageData(0,0,CW,CH);const d=imgd.data;
    const[tr,tg,tb]=hexToRgbOnion(tintColor);
    for(let i=0;i<CW*CH;i++){
      if(d[i*4+3]>10){
        d[i*4  ]=Math.round(d[i*4  ]*0.15+tr*0.85);
        d[i*4+1]=Math.round(d[i*4+1]*0.15+tg*0.85);
        d[i*4+2]=Math.round(d[i*4+2]*0.15+tb*0.85);
      }
    }
    tx.putImageData(imgd,0,0);
    dstCtx.globalAlpha=opacity;
    dstCtx.drawImage(tmp,0,0);
    dstCtx.globalAlpha=1;
  }

  // Draw previous frames (fading opacity)
  cPrev.style.opacity='1';
  for(let k=onionFramesBack;k>=1;k--){
    const op=baseOp*(1-(k-1)*0.2);
    blendFrameOnion(cur-k,ctxPrev,prevColor,op);
  }
  // Draw next frames
  cNext.style.opacity='1';
  for(let k=1;k<=onionFramesFwd;k++){
    const op=baseOp*(1-(k-1)*0.2);
    blendFrameOnion(cur+k,ctxNext,nextColor,op);
  }
}

function saveFrame(){
  frames[cur]=layerCtxs.map(ctx=>ctx.getImageData(0,0,CW,CH));
  fillFrames[cur]=fillCtxs.map(ctx=>ctx.getImageData(0,0,CW,CH));
}
function loadFrame(idx){
  layerCtxs.forEach((ctx,i)=>{ctx.clearRect(0,0,CW,CH);if(frames[idx]&&frames[idx][i])ctx.putImageData(frames[idx][i],0,0);});
  fillCtxs.forEach((ctx,i)=>{ctx.clearRect(0,0,CW,CH);if(fillFrames[idx]&&fillFrames[idx][i])ctx.putImageData(fillFrames[idx][i],0,0);});
  updateLayerVis();
}
function updateLayerVis(){
  layerCanvases.forEach((cv,i)=>{
    const m=layerMeta[i];
    cv.style.display=(m&&m.visible)?'block':'none';
    cv.style.opacity=(m&&m.opacity!=null)?m.opacity:1;
    cv.style.mixBlendMode=(m&&m.blendMode)||'source-over';
  });
  fillCanvases.forEach((cv,i)=>{
    const m=layerMeta[i];
    cv.style.display=(m&&m.visible)?'block':'none';
    cv.style.opacity=(m&&m.opacity!=null)?m.opacity:1;
    cv.style.mixBlendMode=(m&&m.blendMode)||'source-over';
  });
}

function pushUndo(){
  if(!undoStacks[cur])undoStacks[cur]=[];
  undoStacks[cur].push({
    ink:layerCtxs.map(ctx=>ctx.getImageData(0,0,CW,CH)),
    fill:fillCtxs.map(ctx=>ctx.getImageData(0,0,CW,CH))
  });
  if(undoStacks[cur].length>25)undoStacks[cur].shift();
  if(!redoStacks[cur])redoStacks[cur]=[];
  redoStacks[cur]=[];updateUndoBtn();
}
function undo(){
  // If transform is active, undo cancels the transform (restores pre-transform state)
  if(txActive){cancelTransform();return;}
  if(!undoStacks[cur]||!undoStacks[cur].length)return;
  if(!redoStacks[cur])redoStacks[cur]=[];
  redoStacks[cur].push({
    ink:layerCtxs.map(ctx=>ctx.getImageData(0,0,CW,CH)),
    fill:fillCtxs.map(ctx=>ctx.getImageData(0,0,CW,CH))
  });
  const prev=undoStacks[cur].pop();
  layerCtxs.forEach((ctx,i)=>{ctx.clearRect(0,0,CW,CH);if(prev.ink&&prev.ink[i])ctx.putImageData(prev.ink[i],0,0);});
  fillCtxs.forEach((ctx,i)=>{ctx.clearRect(0,0,CW,CH);if(prev.fill&&prev.fill[i])ctx.putImageData(prev.fill[i],0,0);});
  saveFrame();rebuildThumbs();updateUndoBtn();
}
function redo(){
  if(!redoStacks[cur]||!redoStacks[cur].length)return;
  if(!undoStacks[cur])undoStacks[cur]=[];
  undoStacks[cur].push({
    ink:layerCtxs.map(ctx=>ctx.getImageData(0,0,CW,CH)),
    fill:fillCtxs.map(ctx=>ctx.getImageData(0,0,CW,CH))
  });
  const nx=redoStacks[cur].pop();
  layerCtxs.forEach((ctx,i)=>{ctx.clearRect(0,0,CW,CH);if(nx.ink&&nx.ink[i])ctx.putImageData(nx.ink[i],0,0);});
  fillCtxs.forEach((ctx,i)=>{ctx.clearRect(0,0,CW,CH);if(nx.fill&&nx.fill[i])ctx.putImageData(nx.fill[i],0,0);});
  saveFrame();rebuildThumbs();updateUndoBtn();
}
function updateUndoBtn(){
  document.getElementById('btn-undo').disabled=!(undoStacks[cur]&&undoStacks[cur].length>0);
  document.getElementById('btn-redo').disabled=!(redoStacks[cur]&&redoStacks[cur].length>0);
}

function applyStab(x,y){
  if(stabLevel<=0)return[x,y];
  stabBuffer.push([x,y]);
  if(stabBuffer.length>stabLevel+1)stabBuffer.shift();
  // Weighted average — recent points have more weight
  let sx=0,sy=0,sw=0;
  stabBuffer.forEach((p,i)=>{const w=i+1;sx+=p[0]*w;sy+=p[1]*w;sw+=w;});
  return[sx/sw,sy/sw];
}

// Bezier stroke rendering — smoother curves from raw points
// Douglas-Peucker line simplification — removes redundant points
function douglasPeucker(points, epsilon){
  if(points.length<=2) return points;
  let maxDist=0, maxIdx=0;
  const[x1,y1]=points[0], [x2,y2]=points[points.length-1];
  const len=Math.sqrt((x2-x1)**2+(y2-y1)**2)||1;
  for(let i=1;i<points.length-1;i++){
    const[px,py]=points[i];
    // Perpendicular distance from point to line segment
    const d=Math.abs((y2-y1)*px-(x2-x1)*py+x2*y1-y2*x1)/len;
    if(d>maxDist){maxDist=d;maxIdx=i;}
  }
  if(maxDist>epsilon){
    const left=douglasPeucker(points.slice(0,maxIdx+1),epsilon);
    const right=douglasPeucker(points.slice(maxIdx),epsilon);
    return left.slice(0,-1).concat(right);
  }
  return[points[0],points[points.length-1]];
}

// Draw a smooth catmull-rom spline through points (much smoother than quadratic bezier)
function drawSmoothStroke(ctx, points, pressure){
  if(points.length<2) return;
  const pres = (pressure !== undefined) ? pressure : currentPressure;
  const pSize = Math.max(0.5, brushSize * pres);
  ctx.save();
  if(tool==='eraser'){
    ctx.globalCompositeOperation='destination-out';
    ctx.strokeStyle='rgba(0,0,0,1)';
    ctx.lineWidth=pSize*2;
  } else {
    ctx.globalCompositeOperation='source-over';
    ctx.strokeStyle=hexToRgba(brushColor,brushOpacity);
    ctx.lineWidth=pSize;
  }
  ctx.lineCap='round';ctx.lineJoin='round';
  ctx.beginPath();
  ctx.moveTo(points[0][0],points[0][1]);
  if(points.length===2){
    ctx.lineTo(points[1][0],points[1][1]);
  } else {
    // Catmull-Rom → cubic bezier conversion
    for(let i=0;i<points.length-1;i++){
      const p0=points[Math.max(0,i-1)];
      const p1=points[i];
      const p2=points[i+1];
      const p3=points[Math.min(points.length-1,i+2)];
      const cp1x=p1[0]+(p2[0]-p0[0])/6;
      const cp1y=p1[1]+(p2[1]-p0[1])/6;
      const cp2x=p2[0]-(p3[0]-p1[0])/6;
      const cp2y=p2[1]-(p3[1]-p1[1])/6;
      ctx.bezierCurveTo(cp1x,cp1y,cp2x,cp2y,p2[0],p2[1]);
    }
  }
  ctx.stroke();
  ctx.restore();
}

function strokeLineSmooth(ctx,points){
  if(points.length<2) return;
  if(points.length===2){
    strokeLine(ctx,points[0][0],points[0][1],points[1][0],points[1][1]);return;
  }
  ctx.save();
  if(tool==='eraser'){ctx.globalCompositeOperation='destination-out';ctx.strokeStyle='rgba(0,0,0,1)';}
  else{ctx.globalCompositeOperation='source-over';ctx.strokeStyle=hexToRgba(brushColor,brushOpacity);}
  ctx.lineWidth=brushSize;ctx.lineCap='round';ctx.lineJoin='round';
  ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);
  for(let i=1;i<points.length-1;i++){
    const mx=(points[i][0]+points[i+1][0])/2;
    const my=(points[i][1]+points[i+1][1])/2;
    ctx.quadraticCurveTo(points[i][0],points[i][1],mx,my);
  }
  const last=points[points.length-1];
  ctx.lineTo(last[0],last[1]);
  ctx.stroke();ctx.restore();
}
function snapGrid(x,y){if(!showGrid)return[x,y];return[Math.round(x/gridSize)*gridSize,Math.round(y/gridSize)*gridSize];}

function strokeLine(ctx,x1,y1,x2,y2){
  const pSize=Math.max(0.5, brushSize * currentPressure); // pressure-modulated size
  ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
  if(tool==='eraser'){ctx.globalCompositeOperation='destination-out';ctx.strokeStyle='rgba(0,0,0,1)';ctx.lineWidth=pSize*2;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();}
  else if(tool==='rough'){ctx.globalCompositeOperation='source-over';for(let i=0;i<3;i++){const j=pSize*.6;ctx.strokeStyle=hexToRgba(brushColor,brushOpacity*.65);ctx.lineWidth=pSize;ctx.beginPath();ctx.moveTo(x1+(Math.random()-.5)*j,y1+(Math.random()-.5)*j);ctx.lineTo(x2+(Math.random()-.5)*j,y2+(Math.random()-.5)*j);ctx.stroke();}ctx.strokeStyle=hexToRgba(brushColor,brushOpacity*.2);ctx.lineWidth=pSize*.35;ctx.beginPath();ctx.moveTo(x1+Math.random()*5-2.5,y1+Math.random()*5-2.5);ctx.lineTo(x2+Math.random()*5-2.5,y2+Math.random()*5-2.5);ctx.stroke();}
  else{ctx.globalCompositeOperation='source-over';ctx.strokeStyle=hexToRgba(brushColor,brushOpacity);ctx.lineWidth=pSize;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();}
  ctx.restore();
}

function drawShapeOn(ctx,t,sx,sy,ex2,ey2){
  ctx.beginPath();
  if(t==='line'){ctx.moveTo(sx,sy);ctx.lineTo(ex2,ey2);}
  else if(t==='rect'){ctx.rect(sx,sy,ex2-sx,ey2-sy);}
  else if(t==='ellipse'){const cx=(sx+ex2)/2,cy=(sy+ey2)/2,rx=Math.abs(ex2-sx)/2,ry=Math.abs(ey2-sy)/2;ctx.ellipse(cx,cy,Math.max(1,rx),Math.max(1,ry),0,0,Math.PI*2);}
  else if(t==='triangle'){ctx.moveTo((sx+ex2)/2,sy);ctx.lineTo(ex2,ey2);ctx.lineTo(sx,ey2);ctx.closePath();}
  else if(t==='star'){
    const cx=(sx+ex2)/2,cy=(sy+ey2)/2;
    const r=Math.min(Math.abs(ex2-sx),Math.abs(ey2-sy))/2;
    const r2=r*0.4;
    for(let i=0;i<5;i++){
      const a1=i*Math.PI*2/5-Math.PI/2;
      const a2=a1+Math.PI/5;
      if(i===0)ctx.moveTo(cx+r*Math.cos(a1),cy+r*Math.sin(a1));
      else ctx.lineTo(cx+r*Math.cos(a1),cy+r*Math.sin(a1));
      ctx.lineTo(cx+r2*Math.cos(a2),cy+r2*Math.sin(a2));
    }
    ctx.closePath();
  }
  else if(t==='arrow'){
    const dx=ex2-sx,dy=ey2-sy,len=Math.sqrt(dx*dx+dy*dy);
    if(len<2)return;
    const nx=dx/len,ny=dy/len;
    const hw=Math.max(brushSize*3,12),hl=Math.min(hw*1.5,len*0.4);
    const bx=ex2-nx*hl,by=ey2-ny*hl;
    ctx.moveTo(sx,sy);ctx.lineTo(bx,by);
    ctx.moveTo(ex2,ey2);
    const px=-ny,py=nx;
    ctx.lineTo(bx+px*hw,by+py*hw);
    ctx.moveTo(ex2,ey2);
    ctx.lineTo(bx-px*hw,by-py*hw);
  }
  ctx.stroke();
}

function drawShapePreview(ex,ey){
  ctxPreview.clearRect(0,0,CW,CH);ctxPreview.save();
  ctxPreview.strokeStyle=hexToRgba(brushColor,brushOpacity);ctxPreview.lineWidth=brushSize;ctxPreview.lineCap='round';ctxPreview.lineJoin='round';
  const[sx,sy]=showGrid?snapGrid(startX,startY):[startX,startY];
  const[ex2,ey2]=showGrid?snapGrid(ex,ey):[ex,ey];
  drawShapeOn(ctxPreview,tool,sx,sy,ex2,ey2);
  ctxPreview.restore();
}

function commitShape(ex,ey){
  const ctx=getActiveCtx();ctx.save();
  ctx.strokeStyle=hexToRgba(brushColor,brushOpacity);ctx.lineWidth=brushSize;ctx.lineCap='round';ctx.lineJoin='round';
  const[sx,sy]=showGrid?snapGrid(startX,startY):[startX,startY];
  const[ex2,ey2]=showGrid?snapGrid(ex,ey):[ex,ey];
  function applyMirrors(fn){
    fn(sx,sy,ex2,ey2);
    if(symmetry==='h'||symmetry==='4') fn(2*symX-sx, sy, 2*symX-ex2, ey2);
    if(symmetry==='v'||symmetry==='4') fn(sx, 2*symY-sy, ex2, 2*symY-ey2);
    if(symmetry==='4') fn(2*symX-sx, 2*symY-sy, 2*symX-ex2, 2*symY-ey2);
  }
  applyMirrors((x1,y1,x2,y2)=>drawShapeOn(ctx,tool,x1,y1,x2,y2));
  ctx.restore();ctxPreview.clearRect(0,0,CW,CH);
}

function drawStroke(x1,y1,x2,y2){
  const ctx=getActiveCtx();strokeLine(ctx,x1,y1,x2,y2);
  // Mirror across symX (vertical axis) for H
  if(symmetry==='h'||symmetry==='4') strokeLine(ctx, 2*symX-x1, y1, 2*symX-x2, y2);
  // Mirror across symY (horizontal axis) for V
  if(symmetry==='v'||symmetry==='4') strokeLine(ctx, x1, 2*symY-y1, x2, 2*symY-y2);
  // Both for 4-way
  if(symmetry==='4') strokeLine(ctx, 2*symX-x1, 2*symY-y1, 2*symX-x2, 2*symY-y2);
}

let fillExpand=3;
let fillMode='fill';
let fillSampleAll=false;

function floodFill(sx,sy){
  sx=Math.floor(sx); sy=Math.floor(sy);
  if(sx<0||sy<0||sx>=CW||sy>=CH) return;
  const inkCtx=layerCtxs[curLayer], fCtx=fillCtxs[curLayer];
  const[fr,fg,fb]=hexToRgb(brushColor);
  const fa=Math.round(brushOpacity*255);

  // MODE: stroke recolor only
  if(fillMode==='stroke'){
    const id=inkCtx.getImageData(0,0,CW,CH); const d=id.data;
    for(let i=0;i<CW*CH;i++){const b=i*4;if(d[b+3]>30){d[b]=fr;d[b+1]=fg;d[b+2]=fb;d[b+3]=fa;}}
    inkCtx.putImageData(id,0,0);return;
  }

  // Read boundaries: either merged all-layers canvas, or just the active layer
  let inkData;
  if(fillSampleAll){
    const tmp=document.createElement('canvas');tmp.width=CW;tmp.height=CH;
    const tx=tmp.getContext('2d');
    for(let i=0;i<layerMeta.length;i++){
      if(layerMeta[i]&&layerMeta[i].visible){
        tx.drawImage(fillCanvases[i],0,0);
        tx.drawImage(layerCanvases[i],0,0);
      }
    }
    inkData=tx.getImageData(0,0,CW,CH).data;
  } else {
    inkData=inkCtx.getImageData(0,0,CW,CH).data;
  }
  const fid=fCtx.getImageData(0,0,CW,CH);
  const fd=fid.data;
  const startIdx=(sy*CW+sx)*4;

  // Don't fill on solid ink
  if(inkData[startIdx+3]>100) return;

  const tr=fd[startIdx],tg=fd[startIdx+1],tb=fd[startIdx+2],ta=fd[startIdx+3];
  if(tr===fr&&tg===fg&&tb===fb&&ta===fa) return;

  // Scanline flood fill — faster and more reliable than 4-stack
  const inkThresh=60;
  const tol=30;
  const visited=new Uint8Array(CW*CH);

  function canFill(x,y){
    if(x<0||x>=CW||y<0||y>=CH) return false;
    const vi=y*CW+x;
    if(visited[vi]) return false;
    const bi=vi*4;
    // Block at ink strokes
    if(inkData[bi+3]>inkThresh) return false;
    // Match target fill color with tolerance
    return Math.abs(fd[bi]-tr)<=tol && Math.abs(fd[bi+1]-tg)<=tol &&
           Math.abs(fd[bi+2]-tb)<=tol && Math.abs(fd[bi+3]-ta)<=tol;
  }

  const queue=[[sx,sy]];
  const filled=[];
  visited[sy*CW+sx]=1;
  while(queue.length){
    const[x,y]=queue.pop();
    filled.push(y*CW+x);
    const neighbors=[[x+1,y],[x-1,y],[x,y+1],[x,y-1]];
    for(const[nx,ny] of neighbors){
      if(canFill(nx,ny)){visited[ny*CW+nx]=1;queue.push([nx,ny]);}
    }
  }

  // Grow fill under anti-alias zone to close gaps
  const exp=Math.max(0,fillExpand);
  const filledSet=new Uint8Array(CW*CH);
  for(const i of filled) filledSet[i]=1;

  if(exp>0){
    const toSet=[];
    for(const i of filled){
      const y=Math.floor(i/CW), x=i%CW;
      for(let dy=-exp;dy<=exp;dy++){
        for(let dx=-exp;dx<=exp;dx++){
          if(dx*dx+dy*dy>exp*exp) continue;
          const nx=x+dx,ny=y+dy;
          if(nx>=0&&nx<CW&&ny>=0&&ny<CH) toSet.push(ny*CW+nx);
        }
      }
    }
    for(const i of toSet) filledSet[i]=1;
  }

  // Write fill
  for(let i=0;i<CW*CH;i++){
    if(!filledSet[i]) continue;
    const b=i*4; fd[b]=fr;fd[b+1]=fg;fd[b+2]=fb;fd[b+3]=fa;
  }
  fCtx.putImageData(fid,0,0);

  // MODE: both — recolor nearby ink strokes too
  if(fillMode==='both'){
    const iid=inkCtx.getImageData(0,0,CW,CH); const id2=iid.data;
    for(const i of filled){
      const b=i*4;
      if(id2[b+3]>30){id2[b]=Math.round(fr*0.3);id2[b+1]=Math.round(fg*0.3);id2[b+2]=Math.round(fb*0.3);}
    }
    inkCtx.putImageData(iid,0,0);
  }
}

let lassoMarchOffset=0;
let lassoMarchTimer=null;

// ── Text tool ─────────────────────────────────────────────────────
let textPos=null, textActive=false;
let textFontSize=32;

function placeText(cx,cy){
  // Convert canvas coords to screen coords for overlay positioning
  const stackRect=stack.getBoundingClientRect();
  const overlay=document.getElementById('text-overlay');
  const input=document.getElementById('text-input');
  const sx=stackRect.left+cx*scale+vOffX;
  const sy=stackRect.top+cy*scale+vOffY;
  overlay.style.display='block';
  input.style.left=sx+'px'; input.style.top=sy+'px';
  input.style.fontSize=(textFontSize*scale)+'px';
  input.value='';
  textPos={cx,cy};textActive=true;
  setTimeout(()=>input.focus(),10);
}

function commitText(){
  if(!textActive||!textPos) return;
  const input=document.getElementById('text-input');
  const txt=input.value.trim();
  document.getElementById('text-overlay').style.display='none';
  textActive=false;
  if(!txt) return;
  pushUndo();
  const ctx=getActiveCtx();
  ctx.save();
  ctx.font=`${textFontSize}px sans-serif`;
  ctx.fillStyle=hexToRgba(brushColor,brushOpacity);
  ctx.textBaseline='top';
  txt.split('\n').forEach((line,i)=>{
    ctx.fillText(line,textPos.cx,textPos.cy+i*textFontSize*1.2);
  });
  ctx.restore();
  saveFrame();rebuildThumbs();textPos=null;
}

// Escape in text input = cancel, Enter+Ctrl = commit
document.addEventListener('DOMContentLoaded',()=>{
  const ti=document.getElementById('text-input');
  if(ti){
    ti.addEventListener('keydown',e=>{
      if(e.key==='Escape'){document.getElementById('text-overlay').style.display='none';textActive=false;}
      else if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();commitText();}
      e.stopPropagation();
    });
  }

  // Audio row click → jump to frame
  const audioRow=document.getElementById('tl-audio-row');
  if(audioRow){
    audioRow.addEventListener('click',e=>{
      if(!frames.length) return;
      const rect=audioRow.getBoundingClientRect();
      const scroll=document.getElementById('tl-scroll');
      const clickX=(e.clientX-rect.left)+(scroll?scroll.scrollLeft:0);
      let px=0;
      for(let i=0;i<frames.length;i++){
        const w=getFrameW(i)+2;
        if(clickX<px+w){gotoFrame(i);return;}
        px+=w;
      }
      gotoFrame(frames.length-1);
    });
    // waveform redrawn by setTlZoom and rebuildThumbs directly
  }
  
  // Custom Sync Scrolling for Multi-Track Timeline
  const tlsm=document.getElementById('tl-scroll-marker');
  const tlst=document.getElementById('tl-scroll-tracks');
  const tlsf=document.getElementById('tl-scroll-footer');
  const tlg=document.getElementById('tl-gutter-layers');
  const syncX = e=>{
    const l=e.target.scrollLeft;
    if(tlsm&&e.target!==tlsm)tlsm.scrollLeft=l;
    if(tlst&&e.target!==tlst)tlst.scrollLeft=l;
    if(tlsf&&e.target!==tlsf)tlsf.scrollLeft=l;
  };
  if(tlsf)tlsf.addEventListener('scroll', syncX);
  if(tlst)tlst.addEventListener('scroll', syncX);
  if(tlst&&tlg)tlst.addEventListener('scroll', e=>tlg.scrollTop=e.target.scrollTop);
});

// ── Gradient tool ─────────────────────────────────────────────────
let gradStart=null;

function applyGradient(x1,y1,x2,y2){
  pushUndo();

  const inkCtx=layerCtxs[curLayer];
  const fCtx=fillCtxs[curLayer];

  // Build gradient on temp canvas
  const tmp=document.createElement('canvas');tmp.width=CW;tmp.height=CH;
  const tx2=tmp.getContext('2d');
  const grad=tx2.createLinearGradient(x1,y1,x2,y2);
  const[fr,fg,fb]=hexToRgb(brushColor);
  grad.addColorStop(0,hexToRgba(brushColor,brushOpacity));
  grad.addColorStop(1,`rgba(${fr},${fg},${fb},0)`);
  tx2.fillStyle=grad;
  tx2.fillRect(0,0,CW,CH);
  const gradData=tx2.getImageData(0,0,CW,CH).data;

  // Get existing ink and fill pixel data
  const inkData=inkCtx.getImageData(0,0,CW,CH);
  const fillData=fCtx.getImageData(0,0,CW,CH);
  const id=inkData.data;
  const fd=fillData.data;

  // Determine mask: if lasso active, use lasso mask; otherwise whole canvas
  const md=lassoActive&&lassoMask ? lassoMask.data : null;

  for(let i=0;i<CW*CH;i++){
    // Skip if outside lasso mask
    if(md && md[i*4+3]===0) continue;

    // Only color pixels that already have ink OR fill content
    const hasInk  = id[i*4+3] > 10;
    const hasFill = fd[i*4+3] > 10;
    if(!hasInk && !hasFill) continue;

    const ga=gradData[i*4+3]/255;
    if(ga<=0) continue;

    // Apply gradient tint onto fill canvas (preserves ink on top)
    // Blend gradient color with existing fill
    fd[i*4  ]=Math.round(gradData[i*4  ]*ga + fd[i*4  ]*(1-ga));
    fd[i*4+1]=Math.round(gradData[i*4+1]*ga + fd[i*4+1]*(1-ga));
    fd[i*4+2]=Math.round(gradData[i*4+2]*ga + fd[i*4+2]*(1-ga));
    fd[i*4+3]=Math.min(255, fd[i*4+3] + Math.round(gradData[i*4+3]*0.8));

    // Also tint ink pixels directly
    if(hasInk){
      id[i*4  ]=Math.round(gradData[i*4  ]*ga*0.7 + id[i*4  ]*(1-ga*0.7));
      id[i*4+1]=Math.round(gradData[i*4+1]*ga*0.7 + id[i*4+1]*(1-ga*0.7));
      id[i*4+2]=Math.round(gradData[i*4+2]*ga*0.7 + id[i*4+2]*(1-ga*0.7));
    }
  }

  inkCtx.putImageData(inkData,0,0);
  fCtx.putImageData(fillData,0,0);
  saveFrame();rebuildThumbs();
}

function startLassoMarch(){
  if(lassoMarchTimer)return;
  lassoMarchTimer=setInterval(()=>{
    lassoMarchOffset=(lassoMarchOffset+1)%9;
    drawLassoPreview();
  },60);
}
function stopLassoMarch(){
  if(lassoMarchTimer){clearInterval(lassoMarchTimer);lassoMarchTimer=null;}
}

function drawLassoPreview(){
  ctxLasso.clearRect(0,0,CW,CH);
  if(lassoPoints.length<2)return;
  ctxLasso.save();

  // Build path
  ctxLasso.beginPath();
  ctxLasso.moveTo(lassoPoints[0][0],lassoPoints[0][1]);
  lassoPoints.forEach(p=>ctxLasso.lineTo(p[0],p[1]));
  if(lassoActive) ctxLasso.closePath();

  // Fill — semi-transparent blue tint when selection is committed
  if(lassoActive){
    ctxLasso.fillStyle='rgba(80,160,255,0.12)';
    ctxLasso.fill();
  }

  // Outer dark stroke (shadow for visibility on any background)
  ctxLasso.setLineDash([5,4]);
  ctxLasso.lineDashOffset=-lassoMarchOffset;
  ctxLasso.strokeStyle='rgba(0,0,0,0.6)';
  ctxLasso.lineWidth=2.5;
  ctxLasso.stroke();

  // Inner white marching ants
  ctxLasso.setLineDash([5,4]);
  ctxLasso.lineDashOffset=-lassoMarchOffset;
  ctxLasso.strokeStyle='rgba(255,255,255,0.9)';
  ctxLasso.lineWidth=1.2;
  ctxLasso.stroke();

  ctxLasso.setLineDash([]);
  ctxLasso.restore();
}
function commitLasso(){
  if(lassoPoints.length<3){deselect();return;}
  lassoActive=true;
  const offC=document.createElement('canvas');offC.width=CW;offC.height=CH;
  const offX=offC.getContext('2d');
  offX.beginPath();
  offX.moveTo(lassoPoints[0][0],lassoPoints[0][1]);
  lassoPoints.forEach(p=>offX.lineTo(p[0],p[1]));
  offX.closePath();offX.fill();
  lassoMask=offX.getImageData(0,0,CW,CH);
  lassoImgData={
    ink:layerCtxs[curLayer].getImageData(0,0,CW,CH),
    fill:fillCtxs[curLayer].getImageData(0,0,CW,CH)
  };
  drawLassoPreview();
  startLassoMarch();
}

// Move only pixels with actual content (alpha>0) inside mask
function doMoveCanvas(ctx, origImgData, dx, dy){
  const orig=origImgData.data;
  const md=lassoMask.data;
  const cur=ctx.getImageData(0,0,CW,CH);
  const out=new Uint8ClampedArray(cur.data);
  // Erase only content pixels inside mask
  for(let i=0;i<CW*CH;i++){
    if(md[i*4+3]>0 && orig[i*4+3]>0){
      out[i*4]=0;out[i*4+1]=0;out[i*4+2]=0;out[i*4+3]=0;
    }
  }
  // Paste content pixels at offset
  for(let y=0;y<CH;y++){
    for(let x=0;x<CW;x++){
      const si=(y*CW+x)*4;
      if(md[si+3]>0 && orig[si+3]>0){
        const nx2=x+dx, ny2=y+dy;
        if(nx2>=0&&nx2<CW&&ny2>=0&&ny2<CH){
          const di=(ny2*CW+nx2)*4;
          out[di]=orig[si];out[di+1]=orig[si+1];
          out[di+2]=orig[si+2];out[di+3]=orig[si+3];
        }
      }
    }
  }
  ctx.putImageData(new ImageData(out,CW,CH),0,0);
}

function moveSelection(dx,dy){
  if(!lassoActive||!lassoImgData||!lassoMask)return;
  pushUndo();
  doMoveCanvas(layerCtxs[curLayer], lassoImgData.ink,  dx, dy);
  doMoveCanvas(fillCtxs[curLayer],  lassoImgData.fill, dx, dy);
  lassoPoints=lassoPoints.map(p=>[p[0]+dx,p[1]+dy]);
  const offC=document.createElement('canvas');offC.width=CW;offC.height=CH;
  const offX=offC.getContext('2d');
  offX.beginPath();offX.moveTo(lassoPoints[0][0],lassoPoints[0][1]);
  lassoPoints.forEach(p=>offX.lineTo(p[0],p[1]));
  offX.closePath();offX.fill();
  lassoMask=offX.getImageData(0,0,CW,CH);
  lassoImgData={
    ink:layerCtxs[curLayer].getImageData(0,0,CW,CH),
    fill:fillCtxs[curLayer].getImageData(0,0,CW,CH)
  };
  drawLassoPreview();saveFrame();rebuildThumbs();
}

function dragMoveSelection(totalDx,totalDy){
  if(!lassoDragOrigin||!lassoMask)return;
  function applyDrag(ctx, origData){
    const orig=origData.data;
    const md=lassoMask.data;
    const out=new Uint8ClampedArray(origData.data);
    // Erase content pixels at original position
    for(let i=0;i<CW*CH;i++){
      if(md[i*4+3]>0 && orig[i*4+3]>0){
        out[i*4]=0;out[i*4+1]=0;out[i*4+2]=0;out[i*4+3]=0;
      }
    }
    // Paste at total offset
    for(let y=0;y<CH;y++){
      for(let x=0;x<CW;x++){
        const si=(y*CW+x)*4;
        if(md[si+3]>0 && orig[si+3]>0){
          const nx2=x+totalDx, ny2=y+totalDy;
          if(nx2>=0&&nx2<CW&&ny2>=0&&ny2<CH){
            const di=(ny2*CW+nx2)*4;
            out[di]=orig[si];out[di+1]=orig[si+1];
            out[di+2]=orig[si+2];out[di+3]=orig[si+3];
          }
        }
      }
    }
    ctx.putImageData(new ImageData(out,CW,CH),0,0);
  }
  applyDrag(layerCtxs[curLayer], lassoDragOrigin.ink);
  applyDrag(fillCtxs[curLayer],  lassoDragOrigin.fill);
  lassoPoints=lassoDragOrigin.points.map(p=>[p[0]+totalDx,p[1]+totalDy]);
  drawLassoPreview();
}

function deleteSelection(){
  if(!lassoActive||!lassoMask)return;
  pushUndo();
  const md=lassoMask.data;
  function clearCanvas(ctx){
    const dst=ctx.getImageData(0,0,CW,CH);const dd=dst.data;
    for(let i=0;i<CW*CH;i++){
      if(md[i*4+3]>0 && dd[i*4+3]>0) dd[i*4+3]=0;
    }
    ctx.putImageData(dst,0,0);
  }
  clearCanvas(layerCtxs[curLayer]);
  clearCanvas(fillCtxs[curLayer]);
  deselect();saveFrame();rebuildThumbs();
}

function deselect(){
  lassoPoints=[];lassoActive=false;lassoMask=null;lassoImgData=null;
  lassoDragOrigin=null;
  stopLassoMarch();
  ctxLasso.clearRect(0,0,CW,CH);
  if(txActive) deactivateTransform();
}

const shapeTools=new Set(['line','rect','ellipse','triangle','star','arrow']);
const drawingTools=new Set(['pencil','rough','eraser']);
let lastTapTime=0, lastTapPos=null;
function onDown(e){
  // Right-click or pen barrel button (button 2) = deselect lasso / cancel transform
  if(e.button===2 || e.pointerType==='pen' && e.buttons===2){
    if(lassoActive||txActive){
      e.preventDefault();
      if(txActive) cancelTransform();
      else deselect();
    }
    return;
  }
  // Middle click (button 1) for panning is handled in pan mousedown listener, but we can also handle pen middle button here if needed
  if(e.button!==0) return;
  
  if (e.pointerId) cTop.setPointerCapture(e.pointerId);
  
  e.preventDefault();const[x,y]=getPos(e);
  
  // DOUBLE TAP TO UNDO
  if(e.pointerType==='touch' || e.pointerType==='pen') {
     const now = Date.now();
     if(lastTapPos && (now - lastTapTime < 300)) {
         const dist = Math.hypot(x - lastTapPos[0], y - lastTapPos[1]);
         if(dist < 40) {
             undo();
             lastTapTime = 0; lastTapPos = null;
             return; // intercept drawing
         }
     }
     lastTapTime = now;
     lastTapPos = [x,y];
  }
  
  // Update brush pressure if pen
  if(e.pointerType==='pen' && e.pressure !== undefined){
      currentPressure = e.pressure > 0 ? e.pressure : 1.0;
  } else {
      currentPressure = 1.0; // Default for mouse/touch
  }

  // Check sym guide hit
  const symHit=symHitTest(x,y);
  if(symHit){symDrag=symHit;return;}
  // Move / transform tool
  if(tool==='move'){
    if(txActive){txOnDown(x,y);return;}
    if(lassoActive){activateTransform();txOnDown(x,y);return;}
    return;
  }
  if(tool==='fill'){pushUndo();floodFill(x,y);saveFrame();rebuildThumbs();autoSaveColor();return;}
  if(tool==='text'){if(textActive)commitText();else placeText(x,y);return;}
  if(tool==='gradient'){gradStart=[x,y];drawing=true;return;}
  if(tool==='lasso'){
    // If transform was active, commit it first
    if(txActive){applyTransform();deselect();}
    if(lassoActive){
      // Left click inside active lasso starts drag-move (lasso tool only)
      lassoDrag=true;
      lassoDragStart=[x,y];
      lassoDragOrigin={
        ink:layerCtxs[curLayer].getImageData(0,0,CW,CH),
        fill:fillCtxs[curLayer].getImageData(0,0,CW,CH),
        points:[...lassoPoints.map(p=>[...p])]
      };
      pushUndo();
      return;
    }
    lassoPoints=[[x,y]];drawing=true;return;
  }
  if(shapeTools.has(tool)){pushUndo();drawing=true;[startX,startY]=[x,y];return;}
  pushUndo();stabBuffer=[];smoothBuffer=[[x,y]];
  strokePressureSum=currentPressure; strokePressureCount=1;
  drawing=true;[lx,ly]=[x,y];drawStroke(x,y,x,y);
}
function onMove(e){
  if(panDown) return;
  e.preventDefault();const[rx,ry]=getPos(e);
  
  // Update brush pressure
  if(e.pointerType==='pen' && e.pressure !== undefined){
      currentPressure = e.pressure;
  } else {
      currentPressure = 1.0;
  }

  // Sym line drag
  if(symDrag){
    if(symDrag==='h') setSymPos(rx,symY);
    else setSymPos(symX,ry);
    cTop.style.cursor=symDrag==='h'?'ew-resize':'ns-resize';
    return;
  }
  // Move tool drag
  if(tool==='move'&&txDragging){txOnMove(rx,ry);return;}
  // Cursor update
  if(!drawing&&!lassoDrag&&!symDrag){
    if(tool==='move'&&txActive){
      const hit=txHitTest(rx,ry);
      if     (hit==='rotate') cTop.style.cursor='crosshair';
      else if(hit==='scale')  cTop.style.cursor='nwse-resize';
      else if(hit==='move')   cTop.style.cursor='move';
      else if(hit==='pivot')  cTop.style.cursor='cell';
      else                    cTop.style.cursor='default';
    } else {
      const h=symHitTest(rx,ry);
      if(h) cTop.style.cursor=h==='h'?'ew-resize':'ns-resize';
      else updateCursor();
    }
  }
  if(tool==='lasso'){
    if(lassoDrag&&lassoDragStart&&lassoDragOrigin){
      const totalDx=Math.round(rx-lassoDragStart[0]);
      const totalDy=Math.round(ry-lassoDragStart[1]);
      dragMoveSelection(totalDx,totalDy);
      return;
    }
    if(drawing){lassoPoints.push([rx,ry]);drawLassoPreview();}
    return;
  }
  if(shapeTools.has(tool)){if(drawing)drawShapePreview(rx,ry);return;}
  if(tool==='gradient'&&drawing&&gradStart){
    ctxPreview.clearRect(0,0,CW,CH);
    ctxPreview.save();
    // Draw gradient preview along the drag line
    const grad2=ctxPreview.createLinearGradient(gradStart[0],gradStart[1],rx,ry);
    const[fr,fg,fb]=hexToRgb(brushColor);
    grad2.addColorStop(0,hexToRgba(brushColor,0.6));
    grad2.addColorStop(1,`rgba(${fr},${fg},${fb},0)`);
    ctxPreview.strokeStyle=grad2;
    ctxPreview.lineWidth=Math.max(6,brushSize);
    ctxPreview.lineCap='round';
    ctxPreview.setLineDash([]);
    ctxPreview.beginPath();ctxPreview.moveTo(gradStart[0],gradStart[1]);ctxPreview.lineTo(rx,ry);ctxPreview.stroke();
    // Direction arrow overlay
    ctxPreview.strokeStyle='rgba(255,255,255,0.8)';ctxPreview.lineWidth=1.5;
    ctxPreview.setLineDash([4,4]);
    ctxPreview.beginPath();ctxPreview.moveTo(gradStart[0],gradStart[1]);ctxPreview.lineTo(rx,ry);ctxPreview.stroke();
    ctxPreview.setLineDash([]);
    ctxPreview.restore();
    return;
  }
  if(!drawing)return;
  const[x,y]=applyStab(rx,ry);
  smoothBuffer.push([x,y]);
  // Accumulate pressure for final smooth pass
  strokePressureSum += currentPressure;
  strokePressureCount++;
  // Draw incremental segment live (so user sees ink immediately)
  const dx=x-lx,dy=y-ly;const dist=Math.sqrt(dx*dx+dy*dy);const steps=Math.max(1,Math.floor(dist/1.5));
  for(let i=1;i<=steps;i++)drawStroke(lx+dx*((i-1)/steps),ly+dy*((i-1)/steps),lx+dx*(i/steps),ly+dy*(i/steps));
  [lx,ly]=[x,y];
}
function onUp(e){
  if(e.button!==0 && e.pointerType !== 'pen') return;
  if(e.pointerId) cTop.releasePointerCapture(e.pointerId);
  const[x,y]=getPos(e);
  if(tool==='move'&&txDragging){txOnUp();return;}
  if(tool==='lasso'){
    if(lassoDrag){
      lassoDrag=false;lassoDragStart=null;lassoDragOrigin=null;
      lassoImgData={
        ink:layerCtxs[curLayer].getImageData(0,0,CW,CH),
        fill:fillCtxs[curLayer].getImageData(0,0,CW,CH)
      };
      saveFrame();rebuildThumbs();return;
    }
    if(drawing){drawing=false;commitLasso();return;}
  }
  if(shapeTools.has(tool)&&drawing){drawing=false;commitShape(x,y);saveFrame();rebuildThumbs();autoSaveColor();return;}
  if(tool==='gradient'&&drawing&&gradStart){drawing=false;ctxPreview.clearRect(0,0,CW,CH);applyGradient(gradStart[0],gradStart[1],x,y);gradStart=null;autoSaveColor();return;}
  if(!drawing)return;drawing=false;
  const avgPressure = strokePressureCount > 0 ? strokePressureSum / strokePressureCount : 1.0;
  strokePressureSum = 0; strokePressureCount = 0;
  // Re-render stroke as smooth bezier over the raw version
  if((tool==='pencil'||tool==='eraser')&&smoothBuffer.length>3){
    const ctx=getActiveCtx();
    const pts=douglasPeucker(smoothBuffer, 1.2);
    
    // Completely revert the live jagged drawing to prevent overlap thickening
    const prevStrokeState = undoStacks[cur][undoStacks[cur].length-1];
    if(prevStrokeState && prevStrokeState.ink[curLayer]){
      ctx.putImageData(prevStrokeState.ink[curLayer], 0, 0);
    }
    
    // Draw smooth over the raw stroke (replaces jagged segments)
    drawSmoothStroke(ctx, pts, avgPressure);
    // Apply mirrors if symmetry active
    if(symmetry==='h'||symmetry==='4'){
      drawSmoothStroke(ctx, pts.map(([x,y])=>[2*symX-x,y]), avgPressure);
    }
    if(symmetry==='v'||symmetry==='4'){
      drawSmoothStroke(ctx, pts.map(([x,y])=>[x,2*symY-y]), avgPressure);
    }
    if(symmetry==='4'){
      drawSmoothStroke(ctx, pts.map(([x,y])=>[2*symX-x,2*symY-y]), avgPressure);
    }
  }
  smoothBuffer=[];
  saveFrame();rebuildThumbs();autoSaveColor();
}

// pressure variable
let currentPressure = 1.0;
let strokePressureSum = 0, strokePressureCount = 0;

// Pointer events for unified mouse/touch/pen support
cTop.addEventListener('pointerdown',onDown);
cTop.addEventListener('pointermove',onMove);
cTop.addEventListener('pointerup',onUp);
cTop.addEventListener('pointercancel',onUp);
cTop.addEventListener('pointerleave',e=>{
  if(drawing&&!shapeTools.has(tool)&&tool!=='lasso'&&(e.buttons===1 || e.buttons===32))onUp(e);
});

cTop.addEventListener('contextmenu',e=>{
  if(e.pointerType !== 'pen') e.preventDefault();
  if(txActive){cancelTransform();return;}
  if(lassoActive) deselect();
});

document.addEventListener('keydown',e=>{
  const tag=document.activeElement.tagName;if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT')return;
  const k=e.key.toLowerCase();
  if((e.ctrlKey||e.metaKey)&&k==='z'){e.preventDefault();undo();return;}
  if((e.ctrlKey||e.metaKey)&&(k==='y'||(e.shiftKey&&k==='z'))){e.preventDefault();redo();return;}
  if((e.ctrlKey||e.metaKey)&&k==='s'){e.preventDefault();saveProject();return;}
  if((e.ctrlKey||e.metaKey)&&k==='c'){e.preventDefault();copySelection();return;}
  if((e.ctrlKey||e.metaKey)&&k==='v'){e.preventDefault();pasteSelection();return;}
  if((e.ctrlKey||e.metaKey)&&k==='x'){e.preventDefault();cutSelection();return;}
  if((e.ctrlKey||e.metaKey)&&k==='d'){e.preventDefault();duplicateLayer();return;}
  
  const modStr = (e.ctrlKey||e.metaKey) ? 'ctrl' : (e.shiftKey ? 'shift' : (e.altKey ? 'alt' : 'none'));
  const match = (kbName) => keybinds[kbName] && keybinds[kbName].key === k && keybinds[kbName].mod === modStr;

  if(match('pencil')){e.preventDefault();setTool('pencil');return;}
  if(match('rough')){e.preventDefault();setTool('rough');return;}
  if(match('line')){e.preventDefault();setTool('line');return;}
  if(match('rect')){e.preventDefault();setTool('rect');return;}
  if(match('ellipse')){e.preventDefault();setTool('ellipse');return;}
  if(match('fill')){e.preventDefault();setTool('fill');return;}
  if(match('eraser')){e.preventDefault();setTool('eraser');return;}
  if(match('lasso')){e.preventDefault();setTool('lasso');return;}
  if(match('move')){e.preventDefault();setTool('move');return;}
  if(match('text')){e.preventDefault();setTool('text');return;}
  if(match('onion')){e.preventDefault();toggleOnion();return;}
  if(match('grid')){e.preventDefault();toggleGrid();return;}
  if(match('undo')){e.preventDefault();undo();return;}
  if(match('redo')){e.preventDefault();redo();return;}

  if(e.ctrlKey||e.metaKey||e.altKey)return;
  const mv=e.shiftKey?10:1;
  if(k==='['){brushSize=Math.max(1,brushSize-1);document.getElementById('sz-in').value=brushSize;updateCursor();}
  else if(k===']'){brushSize=Math.min(200,brushSize+1);document.getElementById('sz-in').value=brushSize;updateCursor();}
  else if(k==='-'||k==='_'){brushOpacity=Math.max(0.1,+(brushOpacity-.05).toFixed(2));document.getElementById('op-in').value=Math.round(brushOpacity*100);}
  else if(k==='='||k==='+'){brushOpacity=Math.min(1,+(brushOpacity+.05).toFixed(2));document.getElementById('op-in').value=Math.round(brushOpacity*100);}
  else if(k==='arrowleft'&&lassoActive){e.preventDefault();moveSelection(-mv,0);}
  else if(k==='arrowright'&&lassoActive){e.preventDefault();moveSelection(mv,0);}
  else if(k==='arrowup'&&lassoActive){e.preventDefault();moveSelection(0,-mv);}
  else if(k==='arrowdown'&&lassoActive){e.preventDefault();moveSelection(0,mv);}
  else if(k==='delete'&&lassoActive)deleteSelection();
  else if(k==='escape'){if(txActive)cancelTransform();else deselect();}
  else if(k===','){vRotate-=e.shiftKey?45:5;applyViewport();}
  else if(k==='.'){vRotate+=e.shiftKey?45:5;applyViewport();}
  else if(k==='0'&&!e.shiftKey){resetView();}
  else if((k==='+'||k==='=')&&!e.ctrlKey&&!e.metaKey){vZoom=Math.min(30,vZoom*1.15);const aw=area.clientWidth,ah=area.clientHeight;vOffX=(aw-CW*baseScale*vZoom)/2;vOffY=(ah-CH*baseScale*vZoom)/2;applyViewport();}
  else if(k==='-'&&!e.ctrlKey&&!e.metaKey&&!lassoActive&&document.activeElement.tagName!=='INPUT'){vZoom=Math.max(0.05,vZoom/1.15);const aw=area.clientWidth,ah=area.clientHeight;vOffX=(aw-CW*baseScale*vZoom)/2;vOffY=(ah-CH*baseScale*vZoom)/2;applyViewport();}
});

function createLayerCanvasPair(){
  const nc=document.createElement('canvas');nc.width=CW;nc.height=CH;
  const fc=document.createElement('canvas');fc.width=CW;fc.height=CH;
  return{ink:nc,fill:fc,inkCtx:nc.getContext('2d',{willReadFrequently:true}),fillCtx:fc.getContext('2d',{willReadFrequently:true})};
}

function addLayer(){
  if(layerMeta.length>=MAX_LAYERS){
    showToast('Max '+MAX_LAYERS+' layers reached');return;
  }
  // New layer goes ABOVE curLayer → index curLayer+1 in array
  // (array index 0 = bottom visually, highest = top)
  const insertAt=curLayer+1;
  const {ink,fill,inkCtx,fillCtx}=createLayerCanvasPair();
  layerCanvases.splice(insertAt,0,ink);
  layerCtxs.splice(insertAt,0,inkCtx);
  fillCanvases.splice(insertAt,0,fill);
  fillCtxs.splice(insertAt,0,fillCtx);
  layerMeta.splice(insertAt,0,{name:'layer '+(layerMeta.length+1),visible:true,opacity:1,blendMode:'source-over'});
  frames.forEach(f=>{if(f)f.splice(insertAt,0,null);});
  fillFrames.forEach(f=>{if(f)f.splice(insertAt,0,null);});
  curLayer=insertAt; // select the new layer
  ensureSlots();
  rebuildLayerDOMOrder();
  renderLayers();rebuildThumbs();
}

function deleteLayer(){
  if(layerMeta.length<=1)return;
  // Remove from DOM
  layerCanvases[curLayer].remove();
  fillCanvases[curLayer].remove();
  // Remove from arrays
  layerCanvases.splice(curLayer,1);layerCtxs.splice(curLayer,1);
  fillCanvases.splice(curLayer,1);fillCtxs.splice(curLayer,1);
  layerMeta.splice(curLayer,1);
  frames.forEach(f=>{if(f)f.splice(curLayer,1);});
  fillFrames.forEach(f=>{if(f)f.splice(curLayer,1);});
  curLayer=Math.min(curLayer,layerMeta.length-1);
  loadFrame(cur);renderLayers();rebuildThumbs();
}

function moveLayerUp(idx){
  // Move layer up visually = increase index (closer to top of stack)
  if(idx>=layerMeta.length-1)return;
  pushUndo();
  // Swap in all arrays
  [layerCanvases,layerCtxs,fillCanvases,fillCtxs,layerMeta].forEach(arr=>{
    [arr[idx],arr[idx+1]]=[arr[idx+1],arr[idx]];
  });
  frames.forEach(f=>{if(f)[f[idx],f[idx+1]]=[f[idx+1],f[idx]];});
  fillFrames.forEach(f=>{if(f)[f[idx],f[idx+1]]=[f[idx+1],f[idx]];});
  // Fix DOM order — layer idx+1 ink should come before idx ink
  // DOM order: lower index = lower z = appears below
  // Rebuild DOM order for layer canvases
  rebuildLayerDOMOrder();
  if(curLayer===idx) curLayer=idx+1;
  else if(curLayer===idx+1) curLayer=idx;
  renderLayers();rebuildThumbs();
}

function moveLayerDown(idx){
  if(idx<=0)return;
  pushUndo();
  [layerCanvases,layerCtxs,fillCanvases,fillCtxs,layerMeta].forEach(arr=>{
    [arr[idx],arr[idx-1]]=[arr[idx-1],arr[idx]];
  });
  frames.forEach(f=>{if(f)[f[idx],f[idx-1]]=[f[idx-1],f[idx]];});
  fillFrames.forEach(f=>{if(f)[f[idx],f[idx-1]]=[f[idx-1],f[idx]];});
  rebuildLayerDOMOrder();
  if(curLayer===idx) curLayer=idx-1;
  else if(curLayer===idx-1) curLayer=idx;
  renderLayers();rebuildThumbs();
}

function rebuildLayerDOMOrder(){
  // Remove all layer canvases
  layerCanvases.forEach(c=>c.remove());
  fillCanvases.forEach(c=>c.remove());
  // Re-insert index 0 first (bottom), last index closest to cGrid (top visual)
  // Each insertBefore(x, cGrid) puts x just before cGrid,
  // so inserting 0,1,2... means 0 ends up furthest from cGrid (bottom)
  // and the last index ends up closest to cGrid (top) — correct!
  for(let i=0;i<layerCanvases.length;i++){
    stack.insertBefore(fillCanvases[i],cGrid);
    stack.insertBefore(layerCanvases[i],cGrid);
  }
  applyViewport();
}

function mergeDown(){
  if(curLayer<=0)return;
  pushUndo();
  const below=curLayer-1;
  layerCtxs[below].drawImage(layerCanvases[curLayer],0,0);
  layerCtxs[curLayer].clearRect(0,0,CW,CH);
  fillCtxs[below].drawImage(fillCanvases[curLayer],0,0);
  fillCtxs[curLayer].clearRect(0,0,CW,CH);
  saveFrame();renderLayers();rebuildThumbs();
}

function setLayerOpacity(idx,val){
  layerMeta[idx].opacity=Math.max(0,Math.min(1,val));
  updateLayerVis();
}

// ── Layer duplication ─────────────────────────────────────────────
function duplicateLayer(){
  if(layerMeta.length>=MAX_LAYERS){
    showToast('Max '+MAX_LAYERS+' layers reached');return;
  }
  saveFrame();
  const src=curLayer;
  const srcMeta=layerMeta[src];
  const insertAt=src; // duplicate goes above source

  // Create new canvas pair
  const {ink,fill,inkCtx,fillCtx}=createLayerCanvasPair();

  // Copy current pixel data
  const srcInk=layerCtxs[src].getImageData(0,0,CW,CH);
  const srcFill=fillCtxs[src].getImageData(0,0,CW,CH);
  inkCtx.putImageData(srcInk,0,0);
  fillCtx.putImageData(srcFill,0,0);

  // Insert into arrays at position above source
  layerCanvases.splice(insertAt,0,ink);
  layerCtxs.splice(insertAt,0,inkCtx);
  fillCanvases.splice(insertAt,0,fill);
  fillCtxs.splice(insertAt,0,fillCtx);
  layerMeta.splice(insertAt,0,{
    name:srcMeta.name+' copy',
    visible:srcMeta.visible,
    opacity:srcMeta.opacity??1,
    blendMode:srcMeta.blendMode||'source-over'
  });

  // Duplicate frame data for all frames
  frames.forEach((f,fi)=>{
    if(f){
      const srcData=f[src+1]; // +1 because we just shifted everything up
      f.splice(insertAt,0, srcData ? new ImageData(new Uint8ClampedArray(srcData.data),CW,CH) : null);
    }
  });
  fillFrames.forEach((f,fi)=>{
    if(f){
      const srcData=f[src+1];
      f.splice(insertAt,0, srcData ? new ImageData(new Uint8ClampedArray(srcData.data),CW,CH) : null);
    }
  });

  curLayer=insertAt;
  ensureSlots();
  rebuildLayerDOMOrder();
  renderLayers();rebuildThumbs();
  showToast('Layer duplicated');
}

// ── Toast notification ────────────────────────────────────────────
let toastTimer=null;
function showToast(msg){
  const t=document.getElementById('copy-toast');
  if(!t)return;
  t.textContent=msg;
  t.classList.add('show');
  if(toastTimer)clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>t.classList.remove('show'),2000);
}

// ── Clipboard (copy / paste) ──────────────────────────────────────
// Stores: {ink: ImageData, fill: ImageData, mask: ImageData, w, h}
let clipboardData=null;

function copySelection(){
  // Copy active lasso selection, or entire current layer if no selection
  saveFrame();
  const inkCtx=layerCtxs[curLayer];
  const fCtx=fillCtxs[curLayer];

  if(lassoActive&&lassoMask){
    // Copy only selected pixels
    const inkD=inkCtx.getImageData(0,0,CW,CH);
    const fillD=fCtx.getImageData(0,0,CW,CH);
    const md=lassoMask.data;
    const bounds=getBoundingBox(lassoMask);

    // Build cropped ImageDatas
    const w=bounds.w, h=bounds.h;
    const inkOut=new ImageData(w,h);
    const fillOut=new ImageData(w,h);
    const maskOut=new ImageData(w,h);

    for(let y=0;y<h;y++){
      for(let x=0;x<w;x++){
        const si=((bounds.y+y)*CW+(bounds.x+x))*4;
        const di=(y*w+x)*4;
        if(md[si+3]>0){
          inkOut.data[di  ]=inkD.data[si];  inkOut.data[di+1]=inkD.data[si+1];
          inkOut.data[di+2]=inkD.data[si+2];inkOut.data[di+3]=inkD.data[si+3];
          fillOut.data[di  ]=fillD.data[si]; fillOut.data[di+1]=fillD.data[si+1];
          fillOut.data[di+2]=fillD.data[si+2];fillOut.data[di+3]=fillD.data[si+3];
          maskOut.data[di]=255;maskOut.data[di+1]=255;maskOut.data[di+2]=255;maskOut.data[di+3]=255;
        }
      }
    }
    clipboardData={ink:inkOut,fill:fillOut,mask:maskOut,w,h,ox:bounds.x,oy:bounds.y};
    showToast('Copied selection');
  } else {
    // Copy entire layer
    const inkD=inkCtx.getImageData(0,0,CW,CH);
    const fillD=fCtx.getImageData(0,0,CW,CH);
    clipboardData={ink:inkD,fill:fillD,mask:null,w:CW,h:CH,ox:0,oy:0};
    showToast('Copied layer');
  }
}

function pasteSelection(){
  if(!clipboardData){showToast('Nothing to paste');return;}
  pushUndo();
  saveFrame();

  const inkCtx=layerCtxs[curLayer];
  const fCtx=fillCtxs[curLayer];
  const {ink,fill,mask,w,h,ox,oy}=clipboardData;

  if(mask){
    // Paste cropped selection — offset by 10px to make paste visible
    // Paste with smart offset: if same position, offset +20 to distinguish
    const pasteX=Math.max(0,Math.min(ox+20, CW-w));
    const pasteY=Math.max(0,Math.min(oy+20, CH-h));
    const inkDst=inkCtx.getImageData(0,0,CW,CH);
    const fillDst=fCtx.getImageData(0,0,CW,CH);

    for(let y=0;y<h;y++){
      for(let x=0;x<w;x++){
        const si=(y*w+x)*4;
        const di=((pasteY+y)*CW+(pasteX+x))*4;
        if(mask.data[si+3]>0 && pasteY+y<CH && pasteX+x<CW){
          if(ink.data[si+3]>0){
            inkDst.data[di  ]=ink.data[si];  inkDst.data[di+1]=ink.data[si+1];
            inkDst.data[di+2]=ink.data[si+2];inkDst.data[di+3]=ink.data[si+3];
          }
          if(fill.data[si+3]>0){
            fillDst.data[di  ]=fill.data[si]; fillDst.data[di+1]=fill.data[si+1];
            fillDst.data[di+2]=fill.data[si+2];fillDst.data[di+3]=fill.data[si+3];
          }
        }
      }
    }
    inkCtx.putImageData(inkDst,0,0);
    fCtx.putImageData(fillDst,0,0);

    // Auto-select pasted area with lasso
    const pts=[[pasteX,pasteY],[pasteX+w,pasteY],[pasteX+w,pasteY+h],[pasteX,pasteY+h]];
    lassoPoints=pts;lassoActive=true;
    const offC=document.createElement('canvas');offC.width=CW;offC.height=CH;
    const offX=offC.getContext('2d');
    offX.beginPath();offX.moveTo(pts[0][0],pts[0][1]);pts.forEach(p=>offX.lineTo(p[0],p[1]));
    offX.closePath();offX.fill();
    lassoMask=offX.getImageData(0,0,CW,CH);
    lassoImgData={ink:inkCtx.getImageData(0,0,CW,CH),fill:fCtx.getImageData(0,0,CW,CH)};
    drawLassoPreview();
    document.getElementById('sel-toolbar').style.display='flex';
  } else {
    // Paste full layer on top of current
    const tmp=document.createElement('canvas');tmp.width=CW;tmp.height=CH;
    const tx2=tmp.getContext('2d');
    tx2.putImageData(ink,0,0);
    inkCtx.drawImage(tmp,0,0);
    tx2.clearRect(0,0,CW,CH);
    tx2.putImageData(fill,0,0);
    fCtx.drawImage(tmp,0,0);
  }

  saveFrame();rebuildThumbs();
  showToast('Pasted');
}

function cutSelection(){
  if(!lassoActive||!lassoMask){showToast('No selection to cut');return;}
  copySelection();
  deleteSelection();
  showToast('Cut');
}

function renameLayer(idx,name){
  layerMeta[idx].name=name||('layer '+(idx+1));
  if(typeof rebuildThumbs === 'function') rebuildThumbs();
}

// ── Layer drag-and-drop state ─────────────────────────────────────
let layerDragSrcIdx=null;

function moveLayerToIndex(fromIdx, toIdx){
  if(fromIdx===toIdx) return;
  saveFrame();
  // Extract the layer from all arrays
  const extract=arr=>{const[x]=arr.splice(fromIdx,1);return x;};
  const ink=extract(layerCanvases), inkCtx=extract(layerCtxs);
  const fill=extract(fillCanvases), fillCtx=extract(fillCtxs);
  const meta=extract(layerMeta);
  const fFrames=frames.map(f=>{if(!f)return null;const[x]=f.splice(fromIdx,1);return x;});
  const ffFrames=fillFrames.map(f=>{if(!f)return null;const[x]=f.splice(fromIdx,1);return x;});
  // Adjust target index after removal
  const to=fromIdx<toIdx?toIdx-1:toIdx;
  layerCanvases.splice(to,0,ink);layerCtxs.splice(to,0,inkCtx);
  fillCanvases.splice(to,0,fill);fillCtxs.splice(to,0,fillCtx);
  layerMeta.splice(to,0,meta);
  frames.forEach((f,fi)=>{if(f)f.splice(to,0,fFrames[fi]);});
  fillFrames.forEach((f,fi)=>{if(f)f.splice(to,0,ffFrames[fi]);});
  // Update curLayer
  if(curLayer===fromIdx) curLayer=to;
  else if(fromIdx<to && curLayer>fromIdx && curLayer<=to) curLayer--;
  else if(fromIdx>to && curLayer>=to && curLayer<fromIdx) curLayer++;
  rebuildLayerDOMOrder();
  loadFrame(cur);renderLayers();rebuildThumbs();
}

function renderLayers(){
  const countEl=document.getElementById('layer-count');
  if(countEl) countEl.textContent=layerMeta.length+'/'+MAX_LAYERS;
  const list=document.getElementById('layer-list');
  list.innerHTML='';
  // Render top-to-bottom (highest index = top of stack = first in list)
  for(let i=layerMeta.length-1;i>=0;i--){
    const m=layerMeta[i];
    const isActive=i===curLayer;
    const row=document.createElement('div');
    row.className='layer-row'+(isActive?' active':'');
    row.dataset.idx=i;
    row.onclick=(e)=>{
      if(e.target.closest('.lyr-act-btn,.lyr-vis,.lyr-name,.lyr-opacity,.lyr-drag-handle'))return;
      curLayer=i;renderLayers();
    };

    // ── Drag-and-drop handlers ──────────────────────────────────────
    row.draggable=false; // drag initiated only from handle

    row.addEventListener('dragover',e=>{
      e.preventDefault();
      if(layerDragSrcIdx===null||+row.dataset.idx===layerDragSrcIdx) return;
      list.querySelectorAll('.layer-row').forEach(r=>{
        r.classList.remove('drag-over-top','drag-over-bottom');
      });
      // Drop above or below based on mouse position within row
      const rect=row.getBoundingClientRect();
      const mid=rect.top+rect.height/2;
      if(e.clientY<mid) row.classList.add('drag-over-top');
      else row.classList.add('drag-over-bottom');
    });

    row.addEventListener('dragleave',()=>{
      row.classList.remove('drag-over-top','drag-over-bottom');
    });

    row.addEventListener('drop',e=>{
      e.preventDefault();
      row.classList.remove('drag-over-top','drag-over-bottom');
      if(layerDragSrcIdx===null) return;
      const srcIdx=layerDragSrcIdx;
      const dstIdx=+row.dataset.idx;
      layerDragSrcIdx=null;
      if(srcIdx===dstIdx) return;
      // Determine insertion position
      const rect=row.getBoundingClientRect();
      const above=e.clientY<rect.top+rect.height/2;
      // "above" in UI = higher array index
      const insertBefore=above?dstIdx+1:dstIdx;
      moveLayerToIndex(srcIdx, insertBefore);
    });

    // ── Drag handle ───────────────────────────────────────────────
    const handle=document.createElement('div');
    handle.className='lyr-drag-handle';
    handle.title='Drag to reorder';
    handle.innerHTML='⋮⋮';
    handle.addEventListener('mousedown',()=>{
      row.draggable=true;
    });
    row.addEventListener('dragstart',e=>{
      layerDragSrcIdx=i;
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed='move';
    });
    row.addEventListener('dragend',()=>{
      row.draggable=false;
      row.classList.remove('dragging');
      layerDragSrcIdx=null;
      list.querySelectorAll('.layer-row').forEach(r=>{
        r.classList.remove('drag-over-top','drag-over-bottom');
      });
    });
    const vis=document.createElement('div');
    vis.className='lyr-vis'+(m.visible?' on':'');
    vis.innerHTML=m.visible?
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>':
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity:.4"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
    vis.style.cssText='width:22px;height:36px;display:flex;align-items:center;justify-content:center;flex-shrink:0;cursor:pointer;color:#446;';
    vis.querySelector('svg').style.cssText='width:13px;height:13px;';
    vis.onclick=ev=>{
      ev.stopPropagation();
      m.visible=!m.visible;
      layerCanvases[i].style.display=m.visible?'block':'none';
      fillCanvases[i].style.display=m.visible?'block':'none';
      renderLayers();
    };

    // Thumbnail
    const thumb=document.createElement('div');thumb.className='lyr-thumb';
    const tc=document.createElement('canvas');tc.width=40;tc.height=28;
    const tx=tc.getContext('2d');tx.fillStyle='#fff';tx.fillRect(0,0,40,28);
    if(frames[cur]&&frames[cur][i]){
      const ft=document.createElement('canvas');ft.width=CW;ft.height=CH;
      ft.getContext('2d').putImageData(frames[cur][i],0,0);
      tx.drawImage(ft,0,0,40,28);
    } else if(i===curLayer||!frames[cur]){
      tx.drawImage(layerCanvases[i],0,0,40,28);
    }
    thumb.appendChild(tc);

    // Info column: name + opacity slider
    const info=document.createElement('div');info.className='lyr-info';
    const nameEl=document.createElement('input');
    nameEl.className='lyr-name';nameEl.type='text';nameEl.value=m.name;
    nameEl.spellcheck=false;
    nameEl.onclick=ev=>ev.stopPropagation();
    nameEl.onchange=ev=>{renameLayer(i,ev.target.value);};
    nameEl.onkeydown=ev=>{if(ev.key==='Enter')ev.target.blur();ev.stopPropagation();};

    const opRow=document.createElement('div');opRow.style.cssText='display:flex;align-items:center;gap:3px;';
    const opSlider=document.createElement('input');
    opSlider.type='range';opSlider.className='lyr-opacity';
    opSlider.min=0;opSlider.max=100;opSlider.value=Math.round((m.opacity??1)*100);
    opSlider.title='Layer opacity';
    opSlider.onclick=ev=>ev.stopPropagation();
    opSlider.oninput=ev=>{
      ev.stopPropagation();
      setLayerOpacity(i,+ev.target.value/100);
    };
    const opVal=document.createElement('span');
    opVal.style.cssText='font-size:9px;color:#444;min-width:22px;text-align:right;flex-shrink:0;';
    opVal.textContent=Math.round((m.opacity??1)*100)+'%';
    opSlider.oninput=ev=>{
      ev.stopPropagation();
      setLayerOpacity(i,+ev.target.value/100);
      opVal.textContent=ev.target.value+'%';
    };
    opRow.appendChild(opSlider);opRow.appendChild(opVal);

    // Blend mode selector
    const blendRow=document.createElement('div');
    blendRow.style.cssText='display:flex;align-items:center;gap:2px;margin-top:1px;';
    const blendSel=document.createElement('select');
    blendSel.style.cssText='font-size:9px;background:#111;border:1px solid #2a2a2a;color:#666;border-radius:3px;padding:1px 2px;width:100%;font-family:monospace;';
    const blendModes=['source-over','multiply','screen','overlay','darken','lighten','color-dodge','color-burn','hard-light','soft-light','difference','exclusion'];
    blendModes.forEach(bm=>{
      const opt=document.createElement('option');opt.value=bm;opt.textContent=bm;
      if(bm===(m.blendMode||'source-over'))opt.selected=true;
      blendSel.appendChild(opt);
    });
    blendSel.onclick=ev=>ev.stopPropagation();
    blendSel.onchange=ev=>{
      ev.stopPropagation();
      layerMeta[i].blendMode=ev.target.value;
      updateLayerVis();
    };
    blendRow.appendChild(blendSel);
    info.appendChild(nameEl);info.appendChild(opRow);info.appendChild(blendRow);

    // Action buttons: up, down, delete, merge down
    const acts=document.createElement('div');acts.className='lyr-actions';

    function mkAct(svgPath,title,fn){
      const b=document.createElement('button');b.className='lyr-act-btn';b.title=title;
      b.innerHTML='<svg viewBox="0 0 24 24">'+svgPath+'</svg>';
      b.onclick=ev=>{ev.stopPropagation();fn();};
      return b;
    }

    acts.appendChild(mkAct('<polyline points="18,15 12,9 6,15"/>','Move up',()=>moveLayerUp(i)));
    acts.appendChild(mkAct('<polyline points="6,9 12,15 18,9"/>','Move down',()=>moveLayerDown(i)));
    acts.appendChild(mkAct('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>','Duplicate layer',()=>{curLayer=i;duplicateLayer();}));
    acts.appendChild(mkAct('<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>','Delete layer',()=>{curLayer=i;deleteLayer();}));
    acts.appendChild(mkAct('<path d="M8 17l4 4 4-4M12 12v9M4 4h16v8H4z"/>','Merge down',()=>{curLayer=i;mergeDown();}));

    row.appendChild(handle);row.appendChild(vis);row.appendChild(thumb);row.appendChild(info);row.appendChild(acts);
    list.appendChild(row);
  }
}

function ensureSlots(){
  const n=layerMeta.length;
  while(undoStacks.length<=cur)undoStacks.push([]);
  while(redoStacks.length<=cur)redoStacks.push([]);
  while(frameHolds.length<=cur)frameHolds.push(1);
  // Ensure all frame slots have right layer count
  while(frames.length<=cur)frames.push(Array(n).fill(null));
  while(fillFrames.length<=cur)fillFrames.push(Array(n).fill(null));
  // Pad existing frames that have fewer layers than current count
  frames.forEach(f=>{if(f){while(f.length<n)f.push(null);}});
  fillFrames.forEach(f=>{if(f){while(f.length<n)f.push(null);}});
}

function addFrame(){
  saveFrame();
  frames.splice(cur+1,0,Array(layerMeta.length).fill(null));
  fillFrames.splice(cur+1,0,Array(layerMeta.length).fill(null));
  frameHolds.splice(cur+1,0,1);cur++;
  ensureSlots();loadFrame(cur);drawOnion();rebuildThumbs();rebuildTimingGrid();updatePH();updateUndoBtn();
}
function duplicateFrame(){
  saveFrame();
  const copy=frames[cur].map(f=>f?new ImageData(new Uint8ClampedArray(f.data),CW,CH):null);
  const fcopy=fillFrames[cur]?fillFrames[cur].map(f=>f?new ImageData(new Uint8ClampedArray(f.data),CW,CH):null):Array(layerMeta.length).fill(null);
  const h=getHold(cur);
  frames.splice(cur+1,0,copy);fillFrames.splice(cur+1,0,fcopy);frameHolds.splice(cur+1,0,h);cur++;
  ensureSlots();loadFrame(cur);drawOnion();rebuildThumbs();rebuildTimingGrid();updatePH();updateUndoBtn();
}
function deleteFrame(){
  if(frames.length<=1){clearFrame();return;}
  frames.splice(cur,1);fillFrames.splice(cur,1);frameHolds.splice(cur,1);
  undoStacks.splice(cur,1);redoStacks.splice(cur,1);
  if(cur>=frames.length)cur=frames.length-1;
  ensureSlots();loadFrame(cur);drawOnion();rebuildThumbs();rebuildTimingGrid();updatePH();updateUndoBtn();
}
function clearFrame(){
  pushUndo();
  layerCtxs.forEach(ctx=>ctx.clearRect(0,0,CW,CH));
  fillCtxs.forEach(ctx=>ctx.clearRect(0,0,CW,CH));
  saveFrame();rebuildThumbs();
}
function gotoFrame(idx){
  saveFrame();cur=idx;ensureSlots();
  loadFrame(cur);drawOnion();updatePH();updateActiveMarkers();updateUndoBtn();
  document.getElementById('hold-in').value=getHold(cur);rebuildTimingGrid();
  updateAudioPlayhead(cur);drawWaveform();
}
function nextFrame(){if(cur<frames.length-1)gotoFrame(cur+1);}
function prevFrame(){if(cur>0)gotoFrame(cur-1);}

// ══════════════════════════════════════════════════════════
// AUDIO SYSTEM
// ══════════════════════════════════════════════════════════
let audioCtx=null, audioBuffer=null, audioSource=null, audioGainNode=null;
let audioRawBuffer=null, audioDuration=0, audioFileName='';
let audioOffset=0, audioMuted=false, audioVolume=0.8;
let waveformData=null;
let audioStartTime=0, audioStartOffset=0, audioPlayheadRaf=null, audioScrubbing=false;

function audioUpload(){
  if(!audioCtx) audioCtx=new(window.AudioContext||window.webkitAudioContext)();
  if(audioCtx.state==='suspended') audioCtx.resume();

  const inp=document.createElement('input');
  inp.type='file'; inp.accept='audio/*';
  inp.onchange=async e=>{
    const file=e.target.files[0]; if(!file) return;
    const btn=document.getElementById('audio-filename');
    if(btn) btn.textContent='loading...';
    try{
      const ab=await file.arrayBuffer();
      audioRawBuffer=ab.slice(0);
      // decodeAudioData consumes ab, so use the original
      audioBuffer=await audioCtx.decodeAudioData(ab);
      audioDuration=audioBuffer.duration;
      
      const scrollElem = document.getElementById('tl-scroll');
      const viewW = scrollElem ? scrollElem.clientWidth : 800;
      let idealZ = viewW / (audioDuration * fps * 40) * 0.95;
      
      audioFileName=file.name;
      if(btn){btn.textContent=file.name; btn.title=file.name;}
      buildWaveform();
      
      tlZoom = Math.max(0.01, Math.min(1, idealZ));
      const lbl=document.getElementById('tl-zoom-label');
      if(lbl) lbl.textContent=Math.round(tlZoom*100)+'%';
      
      drawWaveform();
      rebuildThumbs();
      updateAudioTime(0);
      showToast('🎵 '+file.name+' — '+audioDuration.toFixed(1)+'s');
    }catch(err){
      if(btn) btn.textContent='error';
      showToast('Audio load failed: '+err.message);
      console.error(err);
    }
  };
  inp.click();
}

function removeAudio(){
  stopAudio();
  audioBuffer=null; audioRawBuffer=null; waveformData=null;
  audioDuration=0; audioFileName='';
  const fn=document.getElementById('audio-filename');
  if(fn){fn.textContent='no audio'; fn.title='';}
  drawWaveform();
  updateAudioTime(0);
  showToast('Audio removed');
}

function stopAudio(){
  if(audioSource){try{audioSource.stop();}catch(e){} audioSource=null;}
  if(audioGainNode){try{audioGainNode.disconnect();}catch(e){} audioGainNode=null;}
}

function setAudioVolume(v){
  audioVolume=Math.max(0,Math.min(1,(+v)/100));
  if(audioGainNode) audioGainNode.gain.value=audioMuted?0:audioVolume;
}
function setAudioOffset(v){ audioOffset=isNaN(+v)?0:+v; }
function toggleAudioMute(){
  audioMuted=!audioMuted;
  const btn=document.getElementById('aud-mute-btn');
  if(btn) btn.textContent=audioMuted?'🔇':'🔊';
  if(audioGainNode) audioGainNode.gain.value=audioMuted?0:audioVolume;
}

function buildWaveform(){
  if(!audioBuffer){waveformData=null;return;}
  const ch=audioBuffer.getChannelData(0);
  const N=ch.length;
  // Build 8192 peak samples across entire audio duration
  const W=8192;
  waveformData=new Float32Array(W);
  const step=N/W;
  for(let i=0;i<W;i++){
    let pk=0;
    const s0=Math.floor(i*step), s1=Math.min(Math.floor((i+1)*step),N);
    for(let s=s0;s<s1;s++){const v=Math.abs(ch[s]);if(v>pk)pk=v;}
    waveformData[i]=pk;
  }
}

function getTotalAnimSeconds(){
  let t=0; frames.forEach((_,i)=>t+=getHold(i)/fps); return Math.max(t,0.001);
}
function getAudioTimeForFrame(fi){
  let t=0; for(let i=0;i<fi;i++)t+=getHold(i)/fps; return t+audioOffset;
}
function updateAudioTime(sec){
  const el=document.getElementById('audio-time'); if(!el) return;
  const fmt=s=>{s=Math.max(0,s);const m=Math.floor(s/60),ss=Math.floor(s%60);return m+':'+(ss<10?'0':'')+ss;};
  el.textContent=fmt(sec)+' / '+fmt(audioDuration);
}

function updateAudioPlayhead(fi){
  if(audioScrubbing) return;
  const ph=document.getElementById('tl-audio-playhead'); if(!ph) return;
  let animSec=0;
  for(let i=0;i<fi;i++) animSec+=getHold(i)/fps;
  if(!playing || !audioCtx) {
     let y=0;
     for(let i=0;i<fi&&i<frames.length;i++) y+=getFrameW(i)+getFrameMargin();
     ph.style.top=Math.max(0,y)+'px';
     ph.style.left='';
     updateAudioTime(animSec);
  }
}

function animateAudioPlayhead(){
  if(!playing) return;
  if(audioCtx && audioSource && !audioMuted && !audioScrubbing){
    const elapsed=audioCtx.currentTime-audioStartTime;
    let currentFileSec=audioStartOffset+elapsed;
    if(currentFileSec<0) currentFileSec=0;
    if(currentFileSec>audioDuration) currentFileSec=audioDuration;
    
    const pxPerSec = fps * (getFrameBaseW() + getFrameMargin());
    const y = currentFileSec * pxPerSec;
    
    const ph=document.getElementById('tl-audio-playhead');
    if(ph) { ph.style.top=Math.max(0,y)+'px'; ph.style.left=''; }
    updateAudioTime(currentFileSec);
    
    const scroll=document.getElementById('xs-scroll');
    if(scroll&&(y>scroll.scrollTop+scroll.clientHeight-60||y<scroll.scrollTop+20))
      scroll.scrollTop=Math.max(0,y-scroll.clientHeight/2);
  }
  audioPlayheadRaf=requestAnimationFrame(animateAudioPlayhead);
}

function drawWaveform(){
  const cv=document.getElementById('tl-audio-canvas'); if(!cv) return;
  
  const pxPerSec = fps * (getFrameBaseW() + getFrameMargin());
  const audioReqH = audioBuffer ? Math.ceil(audioDuration * pxPerSec) : 0;
  const fullMaxH = Math.max(getTotalTimelineW(), audioReqH, 400);
  
  // SECURE MAX WIDTH: Prevent browser Canvas crash
  const H = Math.min(fullMaxH, 30000); 
  const W=60;
  cv.width=W; cv.height=H;
  cv.style.width=W+'px';
  cv.style.height=H+'px';

  const ctx=cv.getContext('2d');
  ctx.fillStyle='#0a0a0a'; ctx.fillRect(0,0,W,H);

  if(!waveformData||!audioBuffer){
    ctx.save();
    ctx.translate(30, Math.min(H/2, 200));
    ctx.rotate(-Math.PI/2);
    ctx.fillStyle='#2a2a2a'; ctx.font='11px monospace';
    ctx.fillText('upload audio 🎵',-40,4);
    ctx.restore();
  } else {
    for(let y=0;y<H;y++){
      let sec = y / pxPerSec;
      if(sec > audioDuration) break;
      const wi=Math.floor((sec/audioDuration)*(waveformData.length-1));
      const peak=waveformData[wi]||0;
      const barW=Math.max(1,peak*(W-2));
      const g=Math.floor(80+peak*175);
      ctx.fillStyle=`rgb(10,${g},30)`; ctx.fillRect(0,y,barW,1);
    }
  }

  let py=0;
  ctx.font='9px monospace';
  for(let i=0;i<frames.length;i++){
    if(py > H) break;
    const isAct=i===cur;
    ctx.strokeStyle=isAct?'rgba(255,200,50,1)':'rgba(255,255,255,0.3)';
    ctx.lineWidth=isAct?1.5:0.5;
    ctx.beginPath(); ctx.moveTo(0,py+0.5); ctx.lineTo(W,py+0.5); ctx.stroke();
    if(isAct && getFrameW(i) >= 16){
      ctx.fillStyle='rgba(255,200,50,0.9)';
      ctx.fillText(i+1,3,py+12);
    }
    py+=getFrameW(i)+getFrameMargin();
  }
  
  const inner=document.getElementById('xs-inner');
  if(inner){inner.style.height=fullMaxH+'px';inner.style.minHeight=fullMaxH+'px';}
}

function startAudioFromFrame(fi){
  stopAudio();
  if(!audioBuffer||!audioCtx) return;

  let animSec=0;
  for(let i=0;i<fi;i++) animSec+=getHold(i)/fps;
  const fileSec=animSec+audioOffset;
  if(fileSec>=audioDuration) return;

  const fileOffset=Math.max(0, fileSec);
  const startDelay=fileSec<0 ? -fileSec : 0;

  audioGainNode=audioCtx.createGain();
  audioGainNode.gain.value=audioMuted?0:audioVolume;
  audioGainNode.connect(audioCtx.destination);

  audioSource=audioCtx.createBufferSource();
  audioSource.buffer=audioBuffer;
  audioSource.connect(audioGainNode);
  audioSource.start(audioCtx.currentTime+startDelay, fileOffset);
  audioSource.onended=()=>{audioSource=null;};
  
  audioStartTime=audioCtx.currentTime+startDelay;
  audioStartOffset=fileOffset;
}

function togglePlay(){
  playing=!playing;
  document.getElementById('play-btn').innerHTML=playing?'&#9632;':'&#9654;';
  if(!playing){
    cancelAnimationFrame(audioPlayheadRaf);
    clearInterval(playIv); playIv=null;
    stopAudio();
    drawWaveform(); updateAudioPlayhead(cur);
    return;
  }
  saveFrame();
  playTick=cur; playTickCount=0;
  
  animateAudioPlayhead();

  // Resume AudioContext synchronously where possible, then start
  if(audioCtx){
    const doPlay=()=>{
      startAudioFromFrame(cur);
      let lastTick=-1;
      playIv=setInterval(()=>{
        playTickCount++;
        if(playTickCount>=getHold(playTick)){
          playTickCount=0;
          playTick=(playTick+1)%frames.length;
          // Only restart audio loop from frame 0 if there's actually an animation sequence!
          if(playTick===0 && frames.length > 1) startAudioFromFrame(0);
        }
        cur=playTick;
        if(cur!==lastTick){ lastTick=cur; loadFrame(cur); drawOnion(); }
        updatePH(); updateActiveMarkers(); updateAudioPlayhead(cur);
      },1000/fps);
    };
    if(audioCtx.state==='suspended'){
      audioCtx.resume().then(doPlay).catch(doPlay);
    } else {
      doPlay();
    }
  } else {
    // No audio — just animate
    let lastTick=-1;
    playIv=setInterval(()=>{
      playTickCount++;
      if(playTickCount>=getHold(playTick)){
        playTickCount=0;
        playTick=(playTick+1)%frames.length;
      }
      cur=playTick;
      if(cur!==lastTick){ lastTick=cur; loadFrame(cur); drawOnion(); }
      updatePH(); updateActiveMarkers(); updateAudioPlayhead(cur);
    },1000/fps);
  }
}

function updatePH(){document.getElementById('phd').textContent=(cur+1)+'/'+frames.length;}

function rebuildTimingGrid(){
  const tg=document.getElementById('tl-timing-row');if(!tg)return;tg.innerHTML='';
  frames.forEach((f,i)=>{
    const h=getHold(i);
    const cellW=getFrameW(i);
    const cell=document.createElement('div');
    cell.className='t-cell'+(i===cur?' active':'');
    cell.style.width=cellW+'px';
    // No minWidth — CSS .t-cell controls height
    cell.onclick=()=>gotoFrame(i);
    // Time label in seconds
    let frameSec=0;for(let k=0;k<i;k++)frameSec+=getHold(k)/fps;
    const secLabel=frameSec.toFixed(1)+'s';
    const tn=document.createElement('div');tn.className='t-num';tn.textContent=i+1;
    const td=document.createElement('div');td.className='t-dur';
    td.textContent=h>1?'×'+h:'';
    // Show time only if cell is wide enough
    if(cellW>48){
      const ts=document.createElement('div');
      ts.style.cssText='font-size:7px;position:absolute;bottom:1px;right:2px;color:#2a4a3a;';
      ts.textContent=secLabel;cell.appendChild(ts);
    }
    cell.appendChild(tn);cell.appendChild(td);if(h>1)cell.classList.add('hold');
    tg.appendChild(cell);
  });
}

function flattenFrame(idx){
  const tc=document.createElement('canvas');tc.width=CW;tc.height=CH;
  const tx=tc.getContext('2d');
  tx.fillStyle='#fff';tx.fillRect(0,0,CW,CH);
  const n=layerMeta.length;
  // Draw bottom layer first (index 0), top layer last (index n-1)
  for(let i=0;i<n;i++){
    const m=layerMeta[i];
    if(!m||!m.visible) continue;
    const op=m.opacity??1;
    tx.globalAlpha=op;
    // fill below ink
    const fData=idx===cur?null:(fillFrames[idx]?fillFrames[idx][i]:null);
    const inkData=idx===cur?null:(frames[idx]?frames[idx][i]:null);
    if(fData){
      const t=document.createElement('canvas');t.width=CW;t.height=CH;
      t.getContext('2d').putImageData(fData,0,0);tx.drawImage(t,0,0);
    } else if(idx===cur){
      tx.drawImage(fillCanvases[i],0,0);
    }
    if(inkData){
      const t=document.createElement('canvas');t.width=CW;t.height=CH;
      t.getContext('2d').putImageData(inkData,0,0);tx.drawImage(t,0,0);
    } else if(idx===cur){
      tx.drawImage(layerCanvases[i],0,0);
    }
  }
  tx.globalAlpha=1;
  return tc;
}

function makeThumb(idx){
  const tc=document.createElement('canvas');tc.width=160;tc.height=90;const tx=tc.getContext('2d');
  tx.fillStyle='#fff';tx.fillRect(0,0,160,90);tx.drawImage(flattenFrame(idx),0,0,160,90);return tc;
}

// Frame cell height = base * hold * zoom
function getFrameBaseW(){ return Math.max(0.1, tlZoom * 40); }
function getFrameW(i){ return getFrameBaseW() * Math.max(1, getHold(i)); }
function getFrameMargin(){ return 0; }
function getTotalTimelineW(){ return frames.reduce((s,_,i)=>s+getFrameW(i),0); }
function setTlZoom(z){
  tlZoom=Math.max(0.01,Math.min(6,z));
  const lbl=document.getElementById('tl-zoom-label');
  if(lbl) lbl.textContent=Math.round(tlZoom*100)+'%';
  rebuildThumbs();
}

function syncTimelineWidths(){
  const tracksCol = document.getElementById('xs-tracks-col');
  const frameCol = document.getElementById('xs-frame-col');
  const audioCol = document.getElementById('xs-audio-col');
  const maxH = getTotalTimelineW();
  if(tracksCol){tracksCol.style.height=maxH+'px'; tracksCol.style.minHeight=maxH+'px';}
  if(frameCol)frameCol.style.height=maxH+'px';
  if(audioCol)audioCol.style.height=maxH+'px';
  return maxH;
}

function buildMarkers(){
  // Removed horizontal markers, now we just rely on vertical marks
}
function rebuildTimingGrid(){
  // Removed horizontal timing grid
}

function rebuildThumbs(){
  const tracksCol=document.getElementById('xs-tracks-col');
  const headerRow=document.getElementById('xs-layer-headers');
  const frameCol=document.getElementById('xs-frame-col');
  
  if(tracksCol) tracksCol.innerHTML='';
  if(headerRow) headerRow.innerHTML='';
  if(frameCol) frameCol.innerHTML='';

  frames.forEach((f,i)=>{
     const cellH = getFrameW(i);
     const fCell = document.createElement('div');
     fCell.className = 'xs-frm-cell'+(i===cur?' active':'');
     fCell.style.height = cellH+'px';
     fCell.textContent = i+1;
     const hld = getHold(i);
     if(hld>1){
        const dh = document.createElement('div');
        dh.className='xs-dur'; dh.textContent='×'+hld;
        fCell.appendChild(dh);
     }
     fCell.onclick=()=>{gotoFrame(i); updateActiveMarkers();};
     if(frameCol) frameCol.appendChild(fCell);
  });

  let colIdx=0;
  for(let lyrIdx=layerMeta.length-1; lyrIdx>=0; lyrIdx--){
    const m=layerMeta[lyrIdx];
    
    if(headerRow){
      const hdr = document.createElement('div');
      hdr.className = 'xs-col-hdr'+(curLayer===lyrIdx?' active':'');
      hdr.textContent = m.name||('L'+(lyrIdx+1));
      hdr.onclick=()=>{curLayer=lyrIdx; updateLayerVis(); renderLayers(); updateActiveMarkers();};
      hdr.style.width = '100px';
      headerRow.appendChild(hdr);
    }

    if(tracksCol){
      const colDiv = document.createElement('div');
      colDiv.className = 'xs-layer-col';
      colDiv.style.width = '100px';

      frames.forEach((f,i)=>{
        const cellH = getFrameW(i);
        const cell = document.createElement('div');
        cell.className = 'xs-cell'+(i===cur&&curLayer===lyrIdx?' active':'');
        if(getHold(i)>1) cell.classList.add('hold');
        cell.style.height = cellH+'px';
        cell.onclick=()=>{curLayer=lyrIdx; updateLayerVis(); renderLayers(); gotoFrame(i); updateActiveMarkers();};
        
        const tc2 = document.createElement('canvas');
        tc2.width = 100; tc2.height = Math.max(1, Math.round(cellH));
        const tx2 = tc2.getContext('2d');
        tx2.fillStyle='#fff'; tx2.fillRect(0,0,100,tc2.height);
        
        if(cellH >= 1){
           const fData = frames[i]?frames[i][lyrIdx]:null;
           const ffData= fillFrames[i]?fillFrames[i][lyrIdx]:null;
           tx2.globalAlpha = m.opacity??1;
           if(ffData){
             const t=document.createElement('canvas');t.width=CW;t.height=CH;
             t.getContext('2d').putImageData(ffData,0,0);tx2.drawImage(t,0,0,100,tc2.height);
           } else if(i===cur){
             tx2.drawImage(fillCanvases[lyrIdx],0,0,100,tc2.height);
           }
           if(fData){
             const t=document.createElement('canvas');t.width=CW;t.height=CH;
             t.getContext('2d').putImageData(fData,0,0);tx2.drawImage(t,0,0,100,tc2.height);
           } else if(i===cur){
             tx2.drawImage(layerCanvases[lyrIdx],0,0,100,tc2.height);
           }
           tx2.globalAlpha=1;
        }
        cell.appendChild(tc2);
        colDiv.appendChild(cell);
      });
      tracksCol.appendChild(colDiv);
    }
    colIdx++;
  }

  // Frame column stretch handlers
  const fCells = frameCol? frameCol.children : [];
  for(let i=0; i<fCells.length; i++){
      const fCell = fCells[i];
      const handle = document.createElement('div');
      handle.style.cssText = 'position:absolute; bottom:-4px; left:0; right:-2000px; height:8px; cursor:ns-resize; z-index:20;';
      let sy=0, iHold=0;
      handle.onpointerdown=e=>{
         e.stopPropagation(); sy=e.clientY; iHold=getHold(i); handle.setPointerCapture(e.pointerId);
      };
      handle.onpointermove=e=>{
         if(!handle.hasPointerCapture(e.pointerId))return;
         const dy = e.clientY - sy;
         const pxPerHold = getFrameBaseW();
         const newHold = Math.max(1, iHold + Math.round(dy/pxPerHold));
         if(newHold !== getHold(i)){
            frameHolds[i] = newHold;
            const targetH = getFrameW(i) + 'px';
            fCell.style.height = targetH;
            let td = fCell.querySelector('.xs-dur');
            if(td) td.textContent = newHold>1?'×'+newHold:'';
            else if(newHold>1){
               td=document.createElement('div'); td.className='xs-dur'; td.textContent='×'+newHold; fCell.appendChild(td);
            }
            
            if(tracksCol){
               for(let c=0; c<tracksCol.children.length; c++){
                  const col = tracksCol.children[c];
                  if(col.children[i]){
                      col.children[i].style.height = targetH;
                      if(newHold>1) col.children[i].classList.add('hold'); else col.children[i].classList.remove('hold');
                  }
               }
            }
            if(i===cur) document.getElementById('hold-in').value=newHold;
            syncTimelineWidths();
         }
      };
      handle.onpointerup=e=>{ handle.releasePointerCapture(e.pointerId); rebuildThumbs(); };
      fCell.appendChild(handle);
  }

  updatePH();
  syncTimelineWidths();
  
  if(typeof drawWaveform === 'function'){
    requestAnimationFrame(()=>{
      drawWaveform(syncTimelineWidths());
      if(typeof updateAudioPlayhead === 'function') updateAudioPlayhead(cur);
    });
  }
}

function updateActiveMarkers(){
  const frameCol = document.getElementById('xs-frame-col');
  if(frameCol){
     Array.from(frameCol.children).forEach((el,i)=>el.classList.toggle('active',i===cur));
  }
  const headers = document.getElementById('xs-layer-headers');
  if(headers){
     Array.from(headers.children).forEach((hdr, idx)=>{
        hdr.classList.toggle('active', (layerMeta.length-1-idx)===curLayer);
     });
  }
  const tracksCol = document.getElementById('xs-tracks-col');
  if(tracksCol){
     Array.from(tracksCol.children).forEach((colDiv, cIdx)=>{
        const actualLayer = layerMeta.length-1-cIdx;
        Array.from(colDiv.children).forEach((cell, fIdx)=>{
           cell.classList.toggle('active', fIdx===cur && actualLayer===curLayer);
        });
     });
  }
  updatePH();
}

function getExportScale(){return parseFloat(document.getElementById('export-scale').value);}
function getExportSize(){const sv=getExportScale();return[Math.round(CW*sv),Math.round(CH*sv)];}
function getExportStatus(){return{btn:document.getElementById('export-btn'),pw:document.getElementById('progress-wrap'),pb:document.getElementById('progress-bar'),st:document.getElementById('export-status')};}

function setExportProgress(pct,msg){
  const{pw,pb,st}=getExportStatus();
  pw.style.display='block'; pb.style.width=pct+'%'; if(msg)st.textContent=msg;
}
function setExportDone(msg){
  const{pw,pb,st}=getExportStatus();
  pw.style.display='none'; st.textContent=msg||'done!';
  setTimeout(()=>st.textContent='',4000);
}
function setExportBusy(busy,btnId){
  const btn=document.getElementById(btnId||'export-btn');
  if(btn) btn.disabled=busy;
}

// ── Image sequence export ────────────────────────────────────────
async function exportSequence(){
  saveFrame();
  const fmt=document.getElementById('seq-fmt').value;
  const q=Math.max(10,Math.min(100,+document.getElementById('seq-quality').value||92))/100;
  const mime='image/'+fmt;
  const ext=fmt==='jpeg'?'jpg':fmt;
  const[gw,gh]=getExportSize();
  setExportBusy(true,'export-btn');
  const st=document.getElementById('export-status');

  for(let i=0;i<frames.length;i++){
    setExportProgress(Math.round(i/frames.length*100),'seq '+(i+1)+'/'+frames.length);
    await new Promise(res=>{
      const tc=document.createElement('canvas'); tc.width=gw; tc.height=gh;
      const tx=tc.getContext('2d');
      tx.fillStyle='#fff'; tx.fillRect(0,0,gw,gh);
      tx.drawImage(flattenFrame(i),0,0,gw,gh);
      tc.toBlob(blob=>{
        const url=URL.createObjectURL(blob);
        const a=document.createElement('a');
        a.href=url;
        a.download='frame_'+(i+1).toString().padStart(4,'0')+'.'+ext;
        a.click();
        URL.revokeObjectURL(url);
        setTimeout(res,80);
      },mime,q);
    });
  }
  setExportDone('seq done ('+frames.length+' files)');
  setExportBusy(false,'export-btn');
}

// ── Spritesheet export ───────────────────────────────────────────
async function exportSpritesheet(){
  saveFrame();
  const[gw,gh]=getExportSize();
  const cols=Math.ceil(Math.sqrt(frames.length));
  const rows=Math.ceil(frames.length/cols);
  const sheet=document.createElement('canvas');
  sheet.width=gw*cols; sheet.height=gh*rows;
  const sx=sheet.getContext('2d');
  sx.fillStyle='#fff';sx.fillRect(0,0,sheet.width,sheet.height);

  for(let i=0;i<frames.length;i++){
    const col=i%cols, row=Math.floor(i/cols);
    const fc=flattenFrame(i);
    sx.drawImage(fc,col*gw,row*gh,gw,gh);
    // Frame number label
    sx.fillStyle='rgba(0,0,0,0.4)';sx.font=`${Math.max(10,gw/12)}px monospace`;
    sx.fillText(i+1,col*gw+4,row*gh+Math.max(14,gw/10));
  }
  setExportProgress(80,'building sheet...');
  sheet.toBlob(blob=>{
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download='spritesheet.png';a.click();
    URL.revokeObjectURL(url);
    setExportDone('Spritesheet: '+cols+'×'+rows+' ('+frames.length+' frames)');
  },'image/png');
}

// ── Single frame export ──────────────────────────────────────────
function exportFrameSingle(){
  saveFrame();
  const fmt=document.getElementById('seq-fmt').value;
  const q=Math.max(10,Math.min(100,+document.getElementById('seq-quality').value||92))/100;
  const mime='image/'+fmt;
  const ext=fmt==='jpeg'?'jpg':fmt;
  const[gw,gh]=getExportSize();
  const tc=document.createElement('canvas'); tc.width=gw; tc.height=gh;
  const tx=tc.getContext('2d');
  tx.fillStyle='#fff'; tx.fillRect(0,0,gw,gh);
  tx.drawImage(flattenFrame(cur),0,0,gw,gh);
  tc.toBlob(async blob=>{
    try {
      if('showSaveFilePicker' in window) {
        const handle = await window.showSaveFilePicker({ 
           suggestedName: 'frame_'+(cur+1)+'.'+ext,
           types: [{description:'Image', accept:{[mime]:['.'+ext]}}]
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
      } else {
        const fname = prompt('File name:', 'frame_'+(cur+1));
        if(!fname) return;
        const url=URL.createObjectURL(blob);
        const a=document.createElement('a');
        a.href=url; a.download=fname+'.'+ext; a.click();
        URL.revokeObjectURL(url);
      }
    } catch(err) {} 
    setExportDone('frame '+(cur+1)+' saved');
  },mime,q);
}

// ── MP4 / WebM export via MediaRecorder ────────────────────────────
// Browser encodes frames as video using Canvas captureStream + MediaRecorder
function exportVideo(format){
  saveFrame();
  const[gw,gh]=getExportSize();
  const mimeType=format==='mp4'?'video/mp4;codecs=avc1':'video/webm;codecs=vp9';
  const mimeTypeFallback=format==='mp4'?'video/mp4':'video/webm';
  const ext=format;

  // Check support
  const supported=MediaRecorder.isTypeSupported(mimeType)||MediaRecorder.isTypeSupported(mimeTypeFallback);
  if(!supported&&format==='mp4'){
    // MP4/H.264 often not supported — fall back to WebM automatically
    const st=document.getElementById('export-status');
    st.textContent='MP4 not supported, exporting WebM...';
    setTimeout(()=>exportVideo('webm'),800);
    return;
  }

  const btnId='export-'+(format==='mp4'?'mp4':'webm')+'-btn';
  setExportBusy(true,btnId);
  setExportProgress(0,'building '+format+'...');

  // Draw all frames to an offscreen canvas at playback fps
  const oc=document.createElement('canvas'); oc.width=gw; oc.height=gh;
  const ox=oc.getContext('2d');

  // Build per-tick frame sequence respecting hold values
  const tickSeq=[];
  frames.forEach((f,i)=>{
    const hold=getHold(i);
    for(let h=0;h<hold;h++) tickSeq.push(i);
  });

  const actualMime=MediaRecorder.isTypeSupported(mimeType)?mimeType:mimeTypeFallback;
  const stream=oc.captureStream(fps);

  let exportAudioSrc = null;
  if(audioBuffer && audioCtx && !audioMuted) {
    const audioDest = audioCtx.createMediaStreamDestination();
    const tracks = audioDest.stream.getAudioTracks();
    if(tracks.length > 0) stream.addTrack(tracks[0]);

    exportAudioSrc = audioCtx.createBufferSource();
    exportAudioSrc.buffer = audioBuffer;
    
    const exportGain = audioCtx.createGain();
    exportGain.gain.value = audioVolume;
    
    exportAudioSrc.connect(exportGain);
    exportGain.connect(audioDest);
    
    const fileSec = audioOffset;
    const fileOffset = Math.max(0, fileSec);
    const startDelay = fileSec < 0 ? -fileSec : 0;
    
    exportAudioSrc.start(audioCtx.currentTime + startDelay, fileOffset);
  }

  const recorder=new MediaRecorder(stream,{mimeType:actualMime,videoBitsPerSecond:8000000});
  const chunks=[];
  recorder.ondataavailable=e=>{if(e.data.size>0)chunks.push(e.data);};
  recorder.onstop=async()=>{
    if(exportAudioSrc) { try { exportAudioSrc.stop(); } catch(err) {} }
    const blob=new Blob(chunks,{type:actualMime.split(';')[0]});
    try {
      if('showSaveFilePicker' in window) {
         const handle=await window.showSaveFilePicker({
           suggestedName: 'animation.'+ext,
           types:[{description:'Video', accept:{[actualMime.split(';')[0]]:['.'+ext]}}]
         });
         const writable=await handle.createWritable();
         await writable.write(blob);
         await writable.close();
      } else {
         const fname=prompt('Enter file name:', 'animation');
         if(!fname) { setExportDone('Export Cancelled'); setExportBusy(false,btnId); return; }
         const url=URL.createObjectURL(blob);
         const a=document.createElement('a');
         a.href=url; a.download=fname+'.'+ext; a.click();
         URL.revokeObjectURL(url);
      }
    } catch(err) {}
    setExportDone(format.toUpperCase()+' done ('+tickSeq.length+' frames)');
    setExportBusy(false,btnId);
  };

  recorder.start();
  let tick=0;
  const msPerFrame=1000/fps;

  function drawNext(){
    if(tick>=tickSeq.length){
      recorder.stop();
      return;
    }
    setExportProgress(Math.round(tick/tickSeq.length*100),'encoding '+format+' '+(tick+1)+'/'+tickSeq.length);
    ox.fillStyle='#fff'; ox.fillRect(0,0,gw,gh);
    ox.drawImage(flattenFrame(tickSeq[tick]),0,0,gw,gh);
    tick++;
    setTimeout(drawNext,msPerFrame);
  }
  // Small delay so recorder is ready
  setTimeout(drawNext,100);
}

function exportMP4(){exportVideo('mp4');}
function exportWebM(){exportVideo('webm');}
function exportGIF(){
  saveFrame();
  const[gw,gh]=getExportSize();
  const btn=document.getElementById('export-btn'); btn.disabled=true;
  const pw=document.getElementById('progress-wrap');
  const pb=document.getElementById('progress-bar');
  const st=document.getElementById('export-status');
  pw.style.display='block'; pb.style.width='0%'; st.textContent='encoding GIF...';

  // Use omggif — pure JS, synchronous, no worker needed
  if(typeof GifWriter!=='undefined'){
    setTimeout(()=>{
      try{
        const buf=new Uint8Array(gw*gh*frames.length*4+1024*100);
        const gw2=new GifWriter(buf,gw,gh,{loop:0});
        const tmp=document.createElement('canvas');tmp.width=gw;tmp.height=gh;
        const tx=tmp.getContext('2d');

        frames.forEach((f,i)=>{
          pb.style.width=Math.round((i/frames.length)*80)+'%';
          tx.fillStyle='#fff'; tx.fillRect(0,0,gw,gh);
          tx.drawImage(flattenFrame(i),0,0,gw,gh);
          const imgd=tx.getImageData(0,0,gw,gh).data;
          // Build palette + indexed pixels
          const {palette,indexed}=quantize(imgd,gw,gh,255);
          gw2.addFrame(0,0,gw,gh,indexed,{
            palette,
            delay:Math.round(getHold(i)*100/fps), // centiseconds
            disposal:2
          });
        });

        pb.style.width='90%'; st.textContent='building file...';
        setTimeout(async()=>{
          const bytes=buf.subarray(0,gw2.end());
          const blob=new Blob([bytes],{type:'image/gif'});
          try {
            if('showSaveFilePicker' in window) {
               const handle=await window.showSaveFilePicker({
                  suggestedName: 'animation.gif',
                  types:[{description:'GIF Image', accept:{'image/gif':['.gif']}}]
               });
               const writable=await handle.createWritable();
               await writable.write(blob);
               await writable.close();
            } else {
               const fname=prompt('Enter file name:', 'animation');
               if(fname) {
                 const url=URL.createObjectURL(blob);
                 const a=document.createElement('a');
                 a.href=url; a.download=fname+'.gif'; a.click();
                 URL.revokeObjectURL(url);
               }
            }
          } catch(e){}
          pw.style.display='none';
          st.textContent='done! ('+frames.length+' frames)';
          btn.disabled=false;
          setTimeout(()=>st.textContent='',4000);
        },50);
      }catch(e){
        console.error(e);
        fallbackGifJs(gw,gh,sv,btn,pw,pb,st);
      }
    },20);
    return;
  }
  // Fallback to gif.js
  fallbackGifJs(gw,gh,sv,btn,pw,pb,st);
}

// Simple median-cut color quantizer → returns {palette:[r,g,b,...], indexed:Uint8Array}
function quantize(imgd,w,h,maxColors){
  // Median-cut quantization for better GIF color quality
  const pixels=[];
  for(let i=0;i<w*h;i++){
    const b=i*4;
    if(imgd[b+3]>10) pixels.push([imgd[b],imgd[b+1],imgd[b+2]]);
  }
  if(!pixels.length) return{palette:[[255,255,255]],indexed:new Uint8Array(w*h)};

  function splitBox(ps){
    let minR=255,maxR=0,minG=255,maxG=0,minB=255,maxB=0;
    for(const[r,g,b] of ps){
      if(r<minR)minR=r;if(r>maxR)maxR=r;
      if(g<minG)minG=g;if(g>maxG)maxG=g;
      if(b<minB)minB=b;if(b>maxB)maxB=b;
    }
    const rR=maxR-minR,rG=maxG-minG,rB=maxB-minB;
    const ch=rR>=rG&&rR>=rB?0:rG>=rB?1:2;
    ps.sort((a,b2)=>a[ch]-b2[ch]);
    const mid=Math.floor(ps.length/2);
    return[ps.slice(0,mid),ps.slice(mid)];
  }
  function avg(ps){let r=0,g=0,b=0;for(const p of ps){r+=p[0];g+=p[1];b+=p[2];}const n=ps.length;return[Math.round(r/n),Math.round(g/n),Math.round(b/n)];}

  let boxes=[pixels];
  while(boxes.length<maxColors){
    let largest=0,li=0;
    boxes.forEach((bx,i)=>{if(bx.length>largest){largest=bx.length;li=i;}});
    if(largest<=1) break;
    const[a,b2]=splitBox(boxes[li]);
    boxes.splice(li,1,a,b2);
  }
  let palette=boxes.filter(bx=>bx.length>0).map(avg);
  let palSize=2;while(palSize<palette.length)palSize*=2;
  while(palette.length<palSize)palette.push([0,0,0]);
  if(palSize>256){palSize=256;palette=palette.slice(0,256);}

  const cache=new Map();
  function nearest(r,g,b){
    const key=(r<<16)|(g<<8)|b;
    if(cache.has(key)) return cache.get(key);
    let best=0,bestD=Infinity;
    for(let i=0;i<palette.length;i++){
      const dr=r-palette[i][0],dg=g-palette[i][1],db=b-palette[i][2];
      const d=dr*dr+dg*dg+db*db;
      if(d<bestD){bestD=d;best=i;}
    }
    cache.set(key,best);return best;
  }

  const indexed=new Uint8Array(w*h);
  for(let i=0;i<w*h;i++){
    const b=i*4;
    indexed[i]=imgd[b+3]<10?0:nearest(imgd[b],imgd[b+1],imgd[b+2]);
  }
  return{palette,indexed};
}

function fallbackGifJs(gw,gh,sv,btn,pw,pb,st){
  if(typeof GIF==='undefined'){
    st.textContent='GIF lib not available — use PNG export';
    btn.disabled=false; pw.style.display='none'; return;
  }
  st.textContent='encoding (gif.js)...';
  const gif=new GIF({
    workers:0,
    workerScript:'https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.worker.js',
    quality:10, width:gw, height:gh, repeat:0
  });
  frames.forEach((f,i)=>{
    const tc=document.createElement('canvas');tc.width=gw;tc.height=gh;
    const tx=tc.getContext('2d');
    tx.fillStyle='#fff'; tx.fillRect(0,0,gw,gh);
    tx.drawImage(flattenFrame(i),0,0,gw,gh);
    gif.addFrame(tc,{delay:Math.round(1000/fps)*getHold(i),copy:true});
  });
  gif.on('progress',p=>{pb.style.width=Math.round(p*100)+'%';});
  gif.on('finished',blob=>{
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url; a.download='animation.gif'; a.click();
    URL.revokeObjectURL(url);
    pw.style.display='none';
    st.textContent='done!'; btn.disabled=false;
    setTimeout(()=>st.textContent='',4000);
  });
  gif.render();
}

initLayers();
// ── Project save/load ─────────────────────────────────────────────
async function saveProject(){
  const pw = document.getElementById('progress-wrap');
  const pb = document.getElementById('progress-bar');
  const st = document.getElementById('export-status');
  if(pw) { pw.style.display='block'; pb.style.width='0%'; st.textContent='compressing layers...'; }

  try{
    const encodeFrames = async (fArr) => {
        const out = [];
        for(let i=0; i<fArr.length; i++) {
           if(pw) pb.style.width=Math.round((i/fArr.length)*45)+'%';
           await new Promise(r => setTimeout(r, 0));
           const frame = fArr[i];
           if(!frame) { out.push(null); continue; }
           const lOut = [];
           for(let j=0; j<frame.length; j++) {
              const d = frame[j];
              if(!d) { lOut.push(null); continue; }
              const tmp = document.createElement('canvas');
              tmp.width = CW; tmp.height = CH;
              tmp.getContext('2d').putImageData(d, 0, 0);
              lOut.push(tmp.toDataURL('image/png'));
           }
           out.push(lOut);
        }
        return out;
    };

    const proj={
      version:3,
      layers:layerMeta.map(m=>({name:m.name,visible:m.visible,opacity:m.opacity??1,blendMode:m.blendMode||'source-over'})),
      curLayer,fps,
      frameHolds:[...frameHolds],
      frames: await encodeFrames(frames),
      fillFrames: await encodeFrames(fillFrames),
      audio: {
          name: audioFileName || '',
          offset: audioOffset,
          duration: audioDuration,
          volume: audioVolume,
          muted: audioMuted
      }
    };
    
    if(pw) { pb.style.width='90%'; st.textContent='building file...'; }
    await new Promise(r => setTimeout(r, 50));
    
    const jsonStr = JSON.stringify(proj);
    const blob = new Blob([jsonStr], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'lookis_project.json'; a.click();
    URL.revokeObjectURL(url);
    
    if(pw) { pw.style.display='none'; st.textContent='Project saved ✓'; setTimeout(()=>st.textContent='',3000); }
    showToast('Project saved as file ✓');
  }catch(e){
    if(pw) pw.style.display='none';
    showToast('Save failed: '+e.message);
  }
}

function loadProject(){
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.json,application/json';
  inp.onchange = e => {
      const file = e.target.files[0];
      if(!file) return;
      const reader = new FileReader();
      reader.onload = async (ev) => {
          try {
              const proj = JSON.parse(ev.target.result);
              if(proj.version === 2) {
                 showToast('Format v2 deprecated. Loading may crash if memory exceeds limits.');
              } else if(proj.version !== 3) {
                 showToast('Incompatible save version'); return;
              }
              
              while(layerCanvases.length>0){layerCanvases[0].remove();fillCanvases[0].remove();layerCanvases.splice(0,1);layerCtxs.splice(0,1);fillCanvases.splice(0,1);fillCtxs.splice(0,1);}
              layerMeta.splice(0);
              
              proj.layers.forEach(m=>{layerMeta.push({name:m.name,visible:m.visible,opacity:m.opacity??1,blendMode:m.blendMode||'source-over'});makeLayerPair();});
              curLayer=proj.curLayer||0;
              fps=proj.fps||12; document.getElementById('fps-in').value=fps;
              frameHolds.length=0; proj.frameHolds.forEach(h=>frameHolds.push(h));
              
              const decodeFrames = async (arr) => {
                  const out = [];
                  for(let i=0; i<arr.length; i++){
                      const f = arr[i];
                      if(!f) { out.push(null); continue; }
                      const lOut = [];
                      for(let j=0; j<f.length; j++){
                          const d = f[j];
                          if(!d) { lOut.push(null); continue; }
                          if(proj.version === 2) {
                              lOut.push(new ImageData(new Uint8ClampedArray(d.data), d.w, d.h));
                          } else {
                              const img = new Image();
                              await new Promise((r, j) => { img.onload=r; img.onerror=j; img.src=d; });
                              const tmp = document.createElement('canvas'); tmp.width = CW; tmp.height = CH;
                              const tx = tmp.getContext('2d'); tx.drawImage(img, 0, 0);
                              lOut.push(tx.getImageData(0,0,CW,CH));
                          }
                      }
                      out.push(lOut);
                  }
                  return out;
              };
              
              showToast('Loading frames into memory...');
              frames.length=0; const decF = await decodeFrames(proj.frames); decF.forEach(x => frames.push(x));
              fillFrames.length=0; const decFF = await decodeFrames(proj.fillFrames); decFF.forEach(x => fillFrames.push(x));
              
              cur=0; ensureSlots();
              rebuildLayerDOMOrder(); loadFrame(0); renderLayers(); rebuildThumbs();
              rebuildTimingGrid(); updatePH(); updateUndoBtn();
              
              if(proj.audio && proj.audio.name) {
                  audioOffset = proj.audio.offset || 0;
                  document.getElementById('aud-offset').value = audioOffset;
                  audioVolume = proj.audio.volume ?? 0.8;
                  document.getElementById('aud-vol').value = Math.round(audioVolume * 100);
                  showToast(`Loaded! Please re-upload audio: ${proj.audio.name}`);
              } else {
                  showToast('Project loaded ✓');
              }
          } catch(err) {
              showToast('Load corrupted: ' + err.message);
          }
      };
      reader.readAsText(file);
  };
  inp.click();
}
function newProject(){
  if(!confirm('Start new project? Unsaved work will be lost.')) return;
  localStorage.removeItem('lookis_project');
  location.reload();
}
// ── Import reference image ───────────────────────────────────────
function importRefImage(){
  const input=document.createElement('input');
  input.type='file';input.accept='image/*';
  input.onchange=async e=>{
    const file=e.target.files[0];if(!file) return;
    const url=URL.createObjectURL(file);
    const img=new Image();
    img.onload=()=>{
      // Add new layer for reference image
      if(layerMeta.length>=MAX_LAYERS){showToast('Max layers reached');return;}
      const insertAt=layerMeta.length; // put at bottom
      const {ink,fill,inkCtx,fillCtx}=createLayerCanvasPair();
      layerCanvases.splice(insertAt,0,ink);layerCtxs.splice(insertAt,0,inkCtx);
      fillCanvases.splice(insertAt,0,fill);fillCtxs.splice(insertAt,0,fillCtx);
      layerMeta.splice(insertAt,0,{name:'ref: '+file.name.split('.')[0],visible:true,opacity:0.5,blendMode:'source-over',isRef:true});
      frames.forEach(f=>{if(f)f.splice(insertAt,0,null);});
      fillFrames.forEach(f=>{if(f)f.splice(insertAt,0,null);});
      // Draw image scaled to canvas
      const sc=Math.min(CW/img.width,CH/img.height,1);
      const iw=img.width*sc,ih=img.height*sc;
      const ox=(CW-iw)/2,oy=(CH-ih)/2;
      inkCtx.drawImage(img,ox,oy,iw,ih);
      ensureSlots();rebuildLayerDOMOrder();renderLayers();rebuildThumbs();
      URL.revokeObjectURL(url);
      showToast('Reference image imported');
    };
    img.src=url;
  };
  input.click();
}

// No autosave interval spam! Users should save projects manually to files.


loadFrame(0);renderLayers();rebuildThumbs();updateUndoBtn();setSymmetry('none');
document.getElementById('hold-in').value=1;

if(typeof window.renderPalette === 'function') window.renderPalette();
updateCursor();
// Initialize audio UI
setTimeout(()=>{drawWaveform();updateAudioPlayhead(0);},100);
// prevent default right-click menu on canvas area
document.getElementById('canvas-area').addEventListener('contextmenu',e=>e.preventDefault());

// Ctrl+scroll on timeline = zoom in/out
document.getElementById('tl-scroll').addEventListener('wheel',e=>{
  if(!e.ctrlKey&&!e.metaKey) return;
  e.preventDefault();
  const factor=e.deltaY<0?1.2:1/1.2;
  setTlZoom(tlZoom*factor);
},{passive:false});

// Timeline audio scrubber attachment
setTimeout(()=>{
  const audWrap=document.getElementById('tl-audio-row');
  if(!audWrap) return;
  function doScrub(e){
    const rect=audWrap.getBoundingClientRect();
    const x=e.clientX-rect.left;
    const pxPerSec=fps*(getFrameBaseW() + getFrameMargin());
    let sec=x/pxPerSec;
    if(sec<0) sec=0;
    if(audioBuffer&&sec>audioDuration) sec=audioDuration;
    
    const ph=document.getElementById('tl-audio-playhead');
    if(ph) ph.style.left=Math.max(0,x)+'px';
    updateAudioTime(sec);
    
    let target=frames.length-1;
    let accum=0;
    for(let i=0;i<frames.length;i++){
      const step=getHold(i)/fps;
      if(sec>=accum && sec<=accum+step){target=i;break;}
      accum+=step;
    }
    if(target!==cur){
      saveFrame();cur=target;ensureSlots();
      loadFrame(cur);drawOnion();updatePH();updateActiveMarkers();
      document.getElementById('hold-in').value=getHold(cur);
    }
  }
  audWrap.addEventListener('pointerdown',e=>{
    audioScrubbing=true;audWrap.setPointerCapture(e.pointerId);
    if(playing) togglePlay(); doScrub(e);
  });
  audWrap.addEventListener('pointermove',e=>{if(audioScrubbing) doScrub(e);});
  audWrap.addEventListener('pointerup',e=>{
    audioScrubbing=false;audWrap.releasePointerCapture(e.pointerId);
    updateAudioPlayhead(cur);
  });
},500);

// Warn before exiting page if unsaved work exists
window.addEventListener('beforeunload', e => {
  const hasUnsaved = frames.length > 1 || undoStacks.some(u => u && u.length > 0);
  if(hasUnsaved) { e.preventDefault(); e.returnValue=''; }
});

// App UI logic for Keybinds and Palettes
let defaultKeybinds = {
  pencil:{mod:'none',key:'p'}, rough:{mod:'none',key:'r'}, eraser:{mod:'none',key:'e'},
  fill:{mod:'none',key:'f'}, line:{mod:'none',key:'q'}, rect:{mod:'none',key:'w'},
  ellipse:{mod:'none',key:'c'}, lasso:{mod:'none',key:'l'}, move:{mod:'none',key:'m'},
  text:{mod:'none',key:'t'}, onion:{mod:'none',key:'o'}, grid:{mod:'none',key:'g'},
  undo:{mod:'ctrl',key:'z'}, redo:{mod:'ctrl',key:'y'}
};

let keybinds = JSON.parse(localStorage.getItem('lookis_keybinds'));
if(!keybinds) keybinds = defaultKeybinds;
else {
  for(let k in keybinds) {
    if(typeof keybinds[k] === 'string') keybinds[k] = {mod:'none', key: keybinds[k]};
  }
}

window.openSettings = function() {
  let s = `<div id="settings-modal" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;">
    <div style="background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:20px;width:380px;max-height:80%;overflow-y:auto;display:flex;flex-direction:column;gap:10px;font-family:monospace;">
      <h3 style="color:#eee;font-size:16px;text-align:center;">Global Settings</h3>
      
      <div style="display:flex;border-bottom:1px solid #333;margin-bottom:10px;">
         <button class="tbtn tbtn-wide st-tab" style="flex:1;border:none;border-radius:0;background:#252525;color:#fff;" onclick="switchTab('st-theme')">App Theme</button>
         <button class="tbtn tbtn-wide st-tab" style="flex:1;border:none;border-radius:0;" onclick="switchTab('st-keys')">Shortcuts</button>
         <button class="tbtn tbtn-wide st-tab" style="flex:1;border:none;border-radius:0;" onclick="switchTab('st-proj')">Project / System</button>
      </div>
      
      <!-- THEME TAB -->
      <div id="st-theme" class="st-content" style="display:flex;flex-direction:column;gap:10px;">
         <div style="display:flex;justify-content:space-between;align-items:center;">
           <span style="color:#aaa;font-size:13px;">App Background Color</span>
           <input type="color" id="set-bg-color" value="${localStorage.getItem('lookis_bg')||'#111111'}" style="width:50px;height:30px;border:1px solid #444;border-radius:3px;cursor:pointer;">
         </div>
         <span style="font-size:11px;color:#888;">This updates the dark HTML background outside your canvas. Focus mode essentially.</span>
      </div>

      <!-- KEYS TAB -->
      <div id="st-keys" class="st-content" style="display:none;flex-direction:column;gap:10px;">`;
  for(const [tool, rule] of Object.entries(keybinds)) {
      s += `<div style="display:flex;justify-content:space-between;align-items:center;">
         <span style="color:#aaa;font-size:13px;text-transform:capitalize;">${tool} Shortcut</span>
         <div style="display:flex; gap:4px;">
           <select class="kb-mod" data-tool="${tool}" style="background:#111;color:#eee;border:1px solid #333;border-radius:3px;font-size:12px;">
             <option value="none" ${rule.mod==='none'?'selected':''}>None</option>
             <option value="ctrl" ${rule.mod==='ctrl'?'selected':''}>Ctrl</option>
             <option value="shift" ${rule.mod==='shift'?'selected':''}>Shift</option>
             <option value="alt" ${rule.mod==='alt'?'selected':''}>Alt</option>
           </select>
           <input type="text" maxlength="1" value="${rule.key}" class="numbox kb-input" data-tool="${tool}" style="width:30px;text-align:center;font-size:14px;background:#111;text-transform:lowercase;">
         </div>
      </div>`;
  }
  s += `</div>
      
      <!-- SYSTEM TAB -->
      <div id="st-proj" class="st-content" style="display:none;flex-direction:column;gap:10px;">
          <div style="color:#888;font-size:11px;">Copy / Paste actions rely on OS security keys (Ctrl+C / Ctrl+V) and cannot be natively remapped via browser standards.</div>
          <div style="color:#888;font-size:11px;">Canvas Size & FPS are configured directly on the main interface to avoid unintentional data wipes.</div>
          <button class="tbtn tbtn-wide" style="margin-top:20px;color:#f88;border-color:#533;" onclick="if(confirm('Wipe ALL frames from active memory?')) location.reload();">Hard Reset Project Memory</button>
      </div>

      <div style="display:flex;gap:10px;margin-top:15px;">
         <button class="tbtn tbtn-wide" style="flex:1;background:#2a4a2a;color:#afc;" onclick="saveSettings()">Apply & Save</button>
         <button class="tbtn tbtn-wide" style="flex:1;" onclick="document.getElementById('settings-modal').remove()">Cancel</button>
      </div></div></div>`;
  document.body.insertAdjacentHTML('beforeend', s);
};

window.switchTab = function(id) {
    document.querySelectorAll('.st-content').forEach(el=>el.style.display='none');
    document.getElementById(id).style.display='flex';
    document.querySelectorAll('.st-tab').forEach(el=>{el.style.background='transparent';el.style.color='#aaa';});
    event.target.style.background='#252525';
    event.target.style.color='#fff';
};

window.saveSettings = function() {
  document.querySelectorAll('.kb-input').forEach(inp => {
     let t = inp.dataset.tool;
     let modStr = document.querySelector(`.kb-mod[data-tool="${t}"]`).value;
     let kStr = inp.value.toLowerCase() || keybinds[t].key;
     keybinds[t] = { mod: modStr, key: kStr };
  });
  localStorage.setItem('lookis_keybinds', JSON.stringify(keybinds));
  
  const bg = document.getElementById('set-bg-color').value;
  localStorage.setItem('lookis_bg', bg);
  document.body.style.background = bg;
  document.getElementById('app').style.background = bg;

  document.getElementById('settings-modal').remove();
  showToast('Global Configuration applied!');
};

const extendedPalette = '["#000000","#ffffff","#ff0000","#00ff00","#0000ff","#ffff00","#00ffff","#ff00ff","#222222","#444444","#888888","#cccccc","#ff8800","#884400","#8b4513","#ffe4c4","#ff4444","#ff44aa","#ff8888","#44aaff","#8888ff","#44ff44","#88ff88"]';
let savedColors = [];
try {
  savedColors = JSON.parse(localStorage.getItem('lookis_colors')||extendedPalette);
} catch(e) {
  savedColors = JSON.parse(extendedPalette);
}
if (!Array.isArray(savedColors)) savedColors = JSON.parse(extendedPalette);

window.renderPalette = function() {
  const p = document.getElementById('palette-swatches');
  if(!p) return;
  p.innerHTML = '';
  savedColors.forEach((c, idx) => {
     const sw = document.createElement('div');
     sw.className = 'swatch';
     sw.style.width = '22px'; sw.style.height = '22px';
     sw.style.background = c;
     sw.onclick = () => {
        brushColor = c; document.getElementById('color-pick').value = c; updateCursor();
        document.getElementById('palette-menu').style.display='none';
     };
     sw.oncontextmenu = (e) => {
        e.preventDefault(); savedColors.splice(idx, 1);
        renderPalette(); localStorage.setItem('lookis_colors', JSON.stringify(savedColors));
     };
     p.appendChild(sw);
  });
};

window.togglePaletteMenu = function() {
  const m = document.getElementById('palette-menu');
  m.style.display = m.style.display==='flex'?'none':'flex';
  renderPalette();
};

window.saveCurrentColor = function() {
  const c = document.getElementById('color-pick').value;
  if(!savedColors.includes(c)) {
     savedColors.push(c);
     localStorage.setItem('lookis_colors', JSON.stringify(savedColors));
     renderPalette();
  }
};

window.loadReferenceImage = function(e) {
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = function(evt) {
     const img = new Image();
     img.onload = function() {
        const cRef = document.getElementById('c-ref');
        if(!cRef) return;
        const ctx = cRef.getContext('2d');
        ctx.clearRect(0,0,CW,CH);
        // Calculate fit center
        const scale = Math.min(CW/img.width, CH/img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        const x = (CW - w) / 2;
        const y = (CH - h) / 2;
        ctx.globalAlpha = 1;
        ctx.drawImage(img, x, y, w, h);
     };
     img.src = evt.target.result;
  };
  reader.readAsDataURL(file);
};

const cRefNode = document.getElementById('c-ref');
if(cRefNode) { cRefNode.width = CW; cRefNode.height = CH; }

const savedBgTheme = localStorage.getItem('lookis_bg');
if(savedBgTheme) {
    document.body.style.background = savedBgTheme;
    document.getElementById('app').style.background = savedBgTheme;
}

// PWA Install Logic
let deferredPrompt;
const installBtn = document.getElementById('btn-install');

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if(installBtn) installBtn.style.display = 'flex';
});

if(installBtn) {
  installBtn.addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        installBtn.style.display = 'none';
      }
      deferredPrompt = null;
    }
  });
}

window.addEventListener('appinstalled', () => {
  if(installBtn) installBtn.style.display = 'none';
  deferredPrompt = null;
});