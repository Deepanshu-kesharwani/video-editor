/* Mini Video Editor – Seamless Playback + Persistent Play/Pause + Replay + Render (Resume Fix) */

const project = {
  videoClips: [],
  audioClips: [],
  overlays: [],
  inPoint: null,
  outPoint: null,
  loop: false,
  settings: { pixelsPerSecond: 140, frameRate: 30 },
  ui: { snapTolerance: 0.1 }
};

const PRELOAD_MARGIN = 0.6;
const CROSSFADE_TIME = 0;
const GAP_ADVANCE_FPS = 60;

/* State */
let globalTime=0,isPlaying=false,draggingPlayhead=false;
let selectedVideoId=null,selectedOverlayId=null,selectedAudioId=null;
let rippleDelete=false;

let activeClip=null,nextClip=null;
let currentVideo=null,nextVideo=null;
let inGapMode=false;

let frameLoopRunning=false;
let lastPerf=null;
let pendingVideoFrameCallback=null;
const audioElements=new Map();

/* DOM */
const qs=s=>document.querySelector(s);
const videoMain=qs('#videoMain');
const overlayStage=qs('#overlayStage');
const videoTrackContent=qs('#videoTrackContent');
const overlayTrackContent=qs('#overlayTrackContent');
const audioTrackContent=qs('#audioTrackContent');
const layersList=qs('#layersList');
const playheadEl=qs('#playhead');
const timeRuler=qs('#timeRuler');
const tracksScroller=qs('#tracksScroller');
const inMarker=qs('#inMarker');
const outMarker=qs('#outMarker');
const rangeFill=qs('#rangeFill');
const tcCurrent=qs('#tcCurrent');
const tcDuration=qs('#tcDuration');
const tcIn=qs('#tcIn');
const tcOut=qs('#tcOut');

const timelineZoom=qs('#timelineZoom');
const loopBtn=qs('#loopBtn');
const rippleBtn=qs('#rippleBtn');
const clipStartInput=qs('#clipStart');
const clipInInput=qs('#clipIn');
const clipOutInput=qs('#clipOut');
const ovStartInput=qs('#ovStart');
const ovEndInput=qs('#ovEnd');
const ovXInput=qs('#ovX');
const ovYInput=qs('#ovY');
const ovScaleInput=qs('#ovScale');
const ovOpacityInput=qs('#ovOpacity');
const ovTextInput=qs('#ovText');
const ovFontSizeInput=qs('#ovFontSize');
const ovColorInput=qs('#ovColor');
const audOffsetInput=qs('#audOffset');
const audVolumeInput=qs('#audVolume');
const audMuteInput=qs('#audMute');
const applyBtn=qs('#applyBtn');
const videoClipSection=qs('#videoClipSection');
const overlaySection=qs('#overlaySection');
const audioSection=qs('#audioSection');
const textFields=qs('#textFields');
const btnClipInSet=qs('#btnClipInSet');
const btnClipOutSet=qs('#btnClipOutSet');
const btnFitToRange=qs('#btnFitToRange');

const inputVideo=qs('#inputVideo');
const inputAudio=qs('#inputAudio');
const inputImage=qs('#inputImage');
const addTextBtn=qs('#addTextBtn');
const splitBtn=qs('#splitBtn');
const deleteBtn=qs('#deleteBtn');
const duplicateBtn=qs('#duplicateBtn');
const undoBtn=qs('#undoBtn');
const redoBtn=qs('#redoBtn');
const playPauseBtn=qs('#playPauseBtn');
const replayBtn=qs('#replayBtn');
const frameBackBtn=qs('#frameBackBtn');
const frameFwdBtn=qs('#frameFwdBtn');
const markInBtn=qs('#markInBtn');
const markOutBtn=qs('#markOutBtn');
const exportBtn=qs('#exportBtn');
const renderBtn=qs('#renderBtn');

const renderModal=qs('#renderModal');
const renderRangeSel=qs('#renderRange');
const renderResSel=qs('#renderRes');
const renderFPSSel=qs('#renderFPS');
const renderAudioChk=qs('#renderAudio');
const renderOverlaysChk=qs('#renderOverlays');
const startRenderBtn=qs('#startRenderBtn');
const cancelRenderBtn=qs('#cancelRenderBtn');
const downloadRenderBtn=qs('#downloadRenderBtn');
const closeRenderBtn=qs('#closeRenderBtn');
const renderProgress=qs('#renderProgress');
const renderFill=qs('#renderFill');
const renderPct=qs('#renderPct');
const renderElapsed=qs('#renderElapsed');
const renderStatus=qs('#renderStatus');
const renderCanvas=qs('#renderCanvas');
const rctx=renderCanvas.getContext('2d');
const hiddenCanvas=qs('#hiddenCanvas');
const hctx=hiddenCanvas.getContext('2d');

/* Utility */
const genId=p=>p+'_'+Math.random().toString(36).slice(2,9);
const fmt=s=>s==null||isNaN(s)?'--:--:--.--':(()=>{
  const ms=Math.floor((s%1)*1000),ss=Math.floor(s)%60,mm=Math.floor(s/60)%60,hh=Math.floor(s/3600);
  return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}.${String(ms).padStart(3,'0')}`;
})();
const pps=()=>project.settings.pixelsPerSecond;
const t2x=t=>t*pps();
const x2t=x=>x/pps();
function projectDuration(){
  let max=0;
  project.videoClips.forEach(c=>{if(c.end>max)max=c.end;});
  project.audioClips.forEach(a=>{const e=a.offset+a.duration;if(e>max)max=e;});
  project.overlays.forEach(o=>{if(o.end>max)max=o.end;});
  return max;
}
function boundedStart(){return project.inPoint!=null?project.inPoint:0;}
function boundedEnd(){return project.outPoint!=null?project.outPoint:projectDuration();}
function validateRange(){ if(project.inPoint!=null&&project.outPoint!=null&&project.outPoint<=project.inPoint) project.outPoint=project.inPoint+0.05; updateRangeMarkers(); }
function findClipAt(t){ return project.videoClips.find(c=>t>=c.start && t<c.end) || null; }
function nextClipAfter(c){ if(!c) return null; const i=project.videoClips.indexOf(c); return project.videoClips[i+1]||null; }

/* History */
const undoStack=[],redoStack=[];let pendingSnapshot=null;
function snapshot(label='change',immediate=false){
  if(!immediate){pendingSnapshot=label;return;}
  undoStack.push(JSON.stringify(project));
  if(undoStack.length>60)undoStack.shift();
  redoStack.length=0;
  pendingSnapshot=null;
  updateUndoRedo();
}
function flushSnapshot(){ if(pendingSnapshot) snapshot(pendingSnapshot,true); }
function undo(){ flushSnapshot(); if(!undoStack.length)return; const cur=JSON.stringify(project); const prev=undoStack.pop(); redoStack.push(cur); Object.assign(project,JSON.parse(prev)); rebuildAll(); updateUndoRedo(); }
function redo(){ flushSnapshot(); if(!redoStack.length)return; const cur=JSON.stringify(project); const nxt=redoStack.pop(); undoStack.push(cur); Object.assign(project,JSON.parse(nxt)); rebuildAll(); updateUndoRedo(); }
function updateUndoRedo(){ undoBtn.disabled=!undoStack.length; redoBtn.disabled=!redoStack.length; }

/* Build UI */
function rebuildAll(){
  buildRuler();
  buildVideoClips();
  buildOverlayClips();
  buildAudioClips();
  buildLayers();
  if(project.videoClips.length && !activeClip){
    activateClip(project.videoClips[0], true);
    globalTime=activeClip.start;
  }
  updateRangeMarkers();
  updateTime(true);
  updateInspector();
}
function buildRuler(){
  timeRuler.innerHTML='';
  const dur=projectDuration();
  timeRuler.style.width=t2x(dur)+'px';
  for(let s=0;s<=dur;s+=1){
    const major=s%5===0;
    const tick=document.createElement('div');
    tick.className='ruler-tick '+(major?'major':'minor');
    tick.style.left=t2x(s)+'px';
    timeRuler.appendChild(tick);
    if(major){
      const lbl=document.createElement('div');
      lbl.className='ruler-label';
      lbl.style.left=t2x(s)+'px';
      lbl.textContent=fmt(s);
      timeRuler.appendChild(lbl);
    }
  }
}
function buildVideoClips(){
  videoTrackContent.innerHTML='';
  project.videoClips.forEach(c=>{
    const el=document.createElement('div');
    el.className='clip video';
    el.dataset.id=c.id;
    el.style.left=t2x(c.start)+'px';
    el.style.width=t2x(c.end-c.start)+'px';
    el.innerHTML=`<div>${c.name}</div><div class="handle left" data-edge="left"></div><div class="handle right" data-edge="right"></div>`;
    el.addEventListener('mousedown',e=>startClipDrag(e,c));
    el.addEventListener('click',e=>{selectVideo(c.id);e.stopPropagation();});
    videoTrackContent.appendChild(el);
  });
  updateSelectionHighlights();
}
function buildOverlayClips(){
  overlayTrackContent.innerHTML='';
  overlayStage.innerHTML='';
  project.overlays.forEach(o=>{
    const clip=document.createElement('div');
    clip.className='clip overlay';
    clip.dataset.id=o.id;
    clip.style.left=t2x(o.start)+'px';
    clip.style.width=t2x(o.end-o.start)+'px';
    clip.innerHTML=`<div>${o.type==='text'?'TEXT':'IMG'}</div><div class="handle left" data-edge="left"></div><div class="handle right" data-edge="right"></div>`;
    clip.addEventListener('mousedown',e=>startOverlayClipDrag(e,o));
    clip.addEventListener('click',e=>{selectOverlay(o.id);e.stopPropagation();});
    overlayTrackContent.appendChild(clip);

    const st=document.createElement('div');
    st.className='overlay';
    st.dataset.id=o.id;
    overlayStage.appendChild(st);
  });
  updateOverlaysVisual();
  updateSelectionHighlights();
}
function buildAudioClips(){
  audioTrackContent.innerHTML='';
  project.audioClips.forEach(a=>{
    const el=document.createElement('div');
    el.className='clip audio';
    el.dataset.id=a.id;
    el.style.left=t2x(a.offset)+'px';
    el.style.width=t2x(a.duration)+'px';
    el.innerHTML=`<div>${a.name}</div><div class="handle left" data-edge="left"></div><div class="handle right" data-edge="right"></div>`;
    el.addEventListener('mousedown',e=>startAudioClipDrag(e,a));
    el.addEventListener('click',e=>{selectAudio(a.id);e.stopPropagation();});
    audioTrackContent.appendChild(el);
  });
  updateSelectionHighlights();
}
function buildLayers(){
  layersList.innerHTML='';
  project.overlays.forEach(o=>{
    const li=document.createElement('li');
    li.className='layer-item';
    li.dataset.id=o.id;
    li.innerHTML=`
      <button class="vis-btn">${o.visible?'👁':'🚫'}</button>
      <button class="lock-btn">${o.locked?'🔒':'🔓'}</button>
      <div class="layer-name">${o.type==='text'?'Text':'Image'} ${o.id.slice(-4)}</div>
      <select class="blend">
        <option ${o.blend==='normal'?'selected':''}>normal</option>
        <option ${o.blend==='multiply'?'selected':''}>multiply</option>
        <option ${o.blend==='screen'?'selected':''}>screen</option>
        <option ${o.blend==='overlay'?'selected':''}>overlay</option>
      </select>
      <div class="opacity-row"><span style="font-size:10px;">Op</span><input type="range" min="0" max="1" step="0.01" value="${o.opacity}"></div>`;
    li.addEventListener('click',e=>{
      if(e.target.classList.contains('vis-btn')){
        o.visible=!o.visible; e.target.textContent=o.visible?'👁':'🚫'; updateOverlaysVisual(); snapshot('ovVis'); return;
      }
      if(e.target.classList.contains('lock-btn')){
        o.locked=!o.locked; e.target.textContent=o.locked?'🔒':'🔓'; snapshot('ovLock'); return;
      }
      selectOverlay(o.id);
    });
    li.querySelector('.blend').addEventListener('change',ev=>{
      o.blend=ev.target.value; updateOverlaysVisual(); snapshot('blend');
    });
    li.querySelector('input[type=range]').addEventListener('input',ev=>{
      o.opacity=parseFloat(ev.target.value); updateOverlaysVisual();
    });
    layersList.appendChild(li);
  });
  updateSelectionHighlights();
}

/* Selection / overlays */
function selectVideo(id){selectedVideoId=id;selectedOverlayId=null;selectedAudioId=null;updateSelectionHighlights();updateInspector();}
function selectOverlay(id){selectedOverlayId=id;selectedVideoId=null;selectedAudioId=null;updateSelectionHighlights();updateInspector();}
function selectAudio(id){selectedAudioId=id;selectedVideoId=null;selectedOverlayId=null;updateSelectionHighlights();updateInspector();}
function updateSelectionHighlights(){
  document.querySelectorAll('.clip.video').forEach(c=>c.classList.toggle('selected',c.dataset.id===selectedVideoId));
  document.querySelectorAll('.clip.overlay').forEach(c=>c.classList.toggle('selected',c.dataset.id===selectedOverlayId));
  document.querySelectorAll('.clip.audio').forEach(c=>c.classList.toggle('selected',c.dataset.id===selectedAudioId));
  document.querySelectorAll('.overlay').forEach(o=>o.classList.toggle('selected',o.dataset.id===selectedOverlayId));
  document.querySelectorAll('.layer-item').forEach(li=>li.classList.toggle('selected',li.dataset.id===selectedOverlayId));
}
function updateOverlaysVisual(){
  const t=globalTime;
  project.overlays.forEach(o=>{
    const el=overlayStage.querySelector(`.overlay[data-id="${o.id}"]`);
    if(!el)return;
    el.style.left=o.x+'px';
    el.style.top=o.y+'px';
    el.style.transform=`scale(${o.scale})`;
    el.style.opacity=o.opacity;
    el.style.mixBlendMode=o.blend||'normal';
    const show=t>=o.start && t<o.end && o.visible;
    el.style.display=show?'block':'none';
    if(o.type==='text'){
      el.textContent=o.text;
      el.style.fontSize=o.fontSize+'px';
      el.style.color=o.color;
    } else if(!el.dataset.img){
      el.innerHTML='';
      const img=document.createElement('img');
      img.src=o.imageSrc;
      img.style.width='100%'; img.style.height='100%';
      el.appendChild(img);
      el.dataset.img='1';
    }
  });
}

/* Inspector */
function updateInspector(){
  [videoClipSection,overlaySection,audioSection,applyBtn].forEach(e=>e.classList.add('hidden'));
  if(selectedVideoId){
    const c=project.videoClips.find(v=>v.id===selectedVideoId); if(!c)return;
    videoClipSection.classList.remove('hidden'); applyBtn.classList.remove('hidden');
    clipStartInput.value=c.start.toFixed(3);
    clipInInput.value=c.in.toFixed(3);
    clipOutInput.value=c.out.toFixed(3);
  } else if(selectedOverlayId){
    const o=project.overlays.find(v=>v.id===selectedOverlayId); if(!o)return;
    overlaySection.classList.remove('hidden'); applyBtn.classList.remove('hidden');
    ovStartInput.value=o.start.toFixed(3);
    ovEndInput.value=o.end.toFixed(3);
    ovXInput.value=o.x; ovYInput.value=o.y;
    ovScaleInput.value=o.scale; ovOpacityInput.value=o.opacity;
    textFields.classList.toggle('hidden', o.type!=='text');
    if(o.type==='text'){
      ovTextInput.value=o.text;
      ovFontSizeInput.value=o.fontSize;
      ovColorInput.value=o.color;
    }
  } else if(selectedAudioId){
    const a=project.audioClips.find(v=>v.id===selectedAudioId); if(!a)return;
    audioSection.classList.remove('hidden'); applyBtn.classList.remove('hidden');
    audOffsetInput.value=a.offset.toFixed(3);
    audVolumeInput.value=a.volume;
    audMuteInput.checked=a.mute;
  }
}

applyBtn.addEventListener('click',()=>{
  if(selectedVideoId){
    const c=project.videoClips.find(v=>v.id===selectedVideoId);
    c.start=parseFloat(clipStartInput.value);
    c.in=parseFloat(clipInInput.value);
    c.out=parseFloat(clipOutInput.value);
    if(c.out>c.duration)c.out=c.duration;
    if(c.out<=c.in+0.05)c.out=c.in+0.05;
    c.end=c.start+(c.out-c.in);
    snapshot('applyClip');
    buildVideoClips();
  } else if(selectedOverlayId){
    const o=project.overlays.find(v=>v.id===selectedOverlayId);
    o.start=parseFloat(ovStartInput.value);
    o.end=parseFloat(ovEndInput.value);
    o.x=parseFloat(ovXInput.value);
    o.y=parseFloat(ovYInput.value);
    o.scale=parseFloat(ovScaleInput.value);
    o.opacity=parseFloat(ovOpacityInput.value);
    if(o.type==='text'){
      o.text=ovTextInput.value;
      o.fontSize=parseInt(ovFontSizeInput.value,10);
      o.color=ovColorInput.value;
    }
    snapshot('applyOverlay');
    buildOverlayClips();
    buildLayers();
  } else if(selectedAudioId){
    const a=project.audioClips.find(v=>v.id===selectedAudioId);
    a.offset=parseFloat(audOffsetInput.value);
    a.volume=parseFloat(audVolumeInput.value);
    a.mute=audMuteInput.checked;
    snapshot('applyAudio');
    buildAudioClips();
  }
  updateInspector();
});

/* Time / Range */
function updateTime(force){
  tcCurrent.textContent=fmt(globalTime);
  tcDuration.textContent=fmt(projectDuration());
  playheadEl.style.left=t2x(globalTime)+'px';
  keepPlayheadVisible();
  if(force) updateOverlaysVisual();
}
function keepPlayheadVisible(){
  const px=t2x(globalTime), left=tracksScroller.scrollLeft, right=left+tracksScroller.clientWidth;
  if(px<left+40) tracksScroller.scrollLeft=Math.max(0,px-40);
  else if(px>right-80) tracksScroller.scrollLeft=px - tracksScroller.clientWidth + 80;
}
function updateRangeMarkers(){
  if(project.inPoint==null) inMarker.classList.add('hidden'); else { inMarker.classList.remove('hidden'); inMarker.style.left=t2x(project.inPoint)+'px'; }
  if(project.outPoint==null) outMarker.classList.add('hidden'); else { outMarker.classList.remove('hidden'); outMarker.style.left=t2x(project.outPoint)+'px'; }
  if(project.inPoint!=null&&project.outPoint!=null){
    rangeFill.classList.remove('hidden');
    rangeFill.style.left=t2x(project.inPoint)+'px';
    rangeFill.style.width=t2x(project.outPoint-project.inPoint)+'px';
  } else rangeFill.classList.add('hidden');
  tcIn.textContent=fmt(project.inPoint);
  tcOut.textContent=fmt(project.outPoint);
}

/* Video activation & preload */
function ensureVideoElements(){
  if(!currentVideo){
    currentVideo=videoMain;
    currentVideo.playsInline=true; currentVideo.muted=true; currentVideo.crossOrigin='anonymous';
  }
  if(!nextVideo){
    nextVideo=document.createElement('video');
    nextVideo.playsInline=true; nextVideo.muted=true; nextVideo.crossOrigin='anonymous';
    nextVideo.style.position='absolute'; nextVideo.style.inset='0'; nextVideo.style.opacity='0'; nextVideo.style.pointerEvents='none';
    currentVideo.parentElement.appendChild(nextVideo);
  }
}
function activateClip(clip, forceStart=false){
  ensureVideoElements();
  inGapMode=false;
  activeClip=clip;
  if(nextClip && nextClip.id===clip.id && nextVideo.src){
    const old=currentVideo;
    currentVideo=nextVideo;
    nextVideo=old;
    nextVideo.pause();
    nextVideo.style.opacity='0';
    currentVideo.style.opacity='1';
    nextClip=null;
    if(forceStart){
      const rel=clip.in;
      try{ currentVideo.currentTime=Math.min(rel,currentVideo.duration||rel);}catch{}
    } else {
      // preserve globalTime offset
      const rel=clip.in + (globalTime - clip.start);
      try{ currentVideo.currentTime=Math.min(rel,currentVideo.duration||rel);}catch{}
    }
    if(isPlaying) currentVideo.play().catch(()=>{});
    attachVideoFrameCallback();
  } else {
    currentVideo.pause();
    currentVideo.style.opacity='1';
    currentVideo.src=clip.src;
    currentVideo.onloadedmetadata=()=>{
      const rel= clip.in + (forceStart ? 0 : Math.max(0, globalTime - clip.start));
      try{ currentVideo.currentTime=Math.min(rel,currentVideo.duration||rel);}catch{}
      if(isPlaying) currentVideo.play().catch(()=>{});
      attachVideoFrameCallback();
    };
    currentVideo.load();
  }
  schedulePreload();
}
function schedulePreload(){
  if(!activeClip) return;
  nextClip=nextClipAfter(activeClip);
  if(!nextClip){ nextVideo.src=''; return; }
  const remaining=activeClip.end - globalTime;
  if(remaining<=PRELOAD_MARGIN && (!nextVideo.src || nextVideo.dataset.clipId!==nextClip.id)){
    nextVideo.pause();
    nextVideo.src=nextClip.src;
    nextVideo.dataset.clipId=nextClip.id;
    nextVideo.onloadedmetadata=()=>{
      const rel=nextClip.in;
      try{ nextVideo.currentTime=Math.min(rel,nextVideo.duration||rel);}catch{}
    };
    nextVideo.onseeked=()=>{};
    nextVideo.load();
  }
}

/* Playback */
playPauseBtn.addEventListener('click',()=> isPlaying?pause():play(/*resume auto*/));
replayBtn.addEventListener('click',()=>{
  pause();
  globalTime=boundedStart();
  const c=findClipAt(globalTime);
  if(c) activateClip(c,true); else enterGapMode();
  updateAudioPlay(globalTime);
  updateTime(true);
  play(); // treat as fresh start
});
frameBackBtn.addEventListener('click',()=>stepFrame(-1));
frameFwdBtn.addEventListener('click',()=>stepFrame(1));

function play(){
  const end=boundedEnd();
  const atEnd = globalTime >= end-1e-6;
  if(atEnd){
    globalTime=boundedStart(); // comment this line if you do NOT want auto restart at end
  }
  const clip=findClipAt(globalTime);
  const sameClipResume = !atEnd && clip && activeClip && activeClip.id===clip.id;
  if(clip){
    // If resuming same clip, do NOT force start.
    activateClip(clip, !sameClipResume && (atEnd || globalTime===clip.start));
    if(sameClipResume){
      // Ensure currentVideo is at the right position
      const desired = clip.in + (globalTime - clip.start);
      if(currentVideo && Math.abs(currentVideo.currentTime - desired) > 0.08){
        try{ currentVideo.currentTime=Math.min(desired,currentVideo.duration||desired);}catch{}
      }
    }
  } else {
    enterGapMode();
  }
  isPlaying=true;
  playPauseBtn.textContent='Pause';
  updateAudioPlay(globalTime);
  startPlayheadLoop();
}
function pause(){
  isPlaying=false;
  playPauseBtn.textContent='Play';
  if(currentVideo) currentVideo.pause();
  if(nextVideo) nextVideo.pause();
  stopAllAudio();
  cancelVideoFrameCallback();
}
function stepFrame(dir){
  pause();
  const frame=1/project.settings.frameRate;
  globalTime=Math.max(0,Math.min(boundedEnd(), globalTime + dir*frame));
  const c=findClipAt(globalTime);
  if(c){
    activateClip(c,true); // stepping = precise frame, then we display that frame paused
    currentVideo.pause();
    currentVideo.currentTime=c.in + (globalTime - c.start);
  } else enterGapMode();
  updateAudioPlay(globalTime);
  updateTime(true);
}
function enterGapMode(){
  inGapMode=true;
  activeClip=null;
  if(currentVideo) currentVideo.pause();
  cancelVideoFrameCallback();
}
function handlePlaybackEnd(){
  const end=boundedEnd();
  globalTime=end;
  if(project.loop){
    globalTime=boundedStart();
    const c=findClipAt(globalTime);
    if(c) activateClip(c,true); else enterGapMode();
    updateAudioPlay(globalTime);
  } else {
    pause();
  }
  updateTime(true);
}

/* Loops */
function startPlayheadLoop(){
  if(!frameLoopRunning){
    frameLoopRunning=true;
    lastPerf=performance.now();
    playheadRAF();
  }
  attachVideoFrameCallback();
}
function playheadRAF(){
  if(!frameLoopRunning) return;
  const now=performance.now();
  const dt=(now-lastPerf)/1000;
  lastPerf=now;
  if(isPlaying){
    if(activeClip && currentVideo && !inGapMode){
      globalTime = activeClip.start + (currentVideo.currentTime - activeClip.in);
      if(globalTime >= activeClip.end - 1e-4){
        const nxt=nextClipAfter(activeClip);
        if(nxt) activateClip(nxt,true);
        else {
          const end=boundedEnd();
          if(globalTime>=end) handlePlaybackEnd(); else enterGapMode();
        }
      } else schedulePreload();
    } else {
      globalTime += dt;
      if(globalTime>=boundedEnd()) handlePlaybackEnd();
    }
    updateAudioPlay(globalTime);
    updateTime(false);
  }
  requestAnimationFrame(playheadRAF);
}
function attachVideoFrameCallback(){
  cancelVideoFrameCallback();
  if(!currentVideo || !('requestVideoFrameCallback' in currentVideo)) return;
  const cb=(now,meta)=>{
    if(isPlaying && activeClip && !inGapMode){
      globalTime = activeClip.start + (currentVideo.currentTime - activeClip.in);
      updateAudioPlay(globalTime);
      updateTime(false);
    }
    if(isPlaying) pendingVideoFrameCallback=currentVideo.requestVideoFrameCallback(cb);
  };
  pendingVideoFrameCallback=currentVideo.requestVideoFrameCallback(cb);
}
function cancelVideoFrameCallback(){
  if(pendingVideoFrameCallback && currentVideo && currentVideo.cancelVideoFrameCallback){
    try{ currentVideo.cancelVideoFrameCallback(pendingVideoFrameCallback);}catch{}
  }
  pendingVideoFrameCallback=null;
}

/* Audio */
function updateAudioPlay(t){
  project.audioClips.forEach(a=>{
    const active=t>=a.offset && t<a.offset+a.duration;
    let el=audioElements.get(a.id);
    if(active){
      if(!el){
        el=new Audio(a.src);
        el.crossOrigin='anonymous';
        el.volume=a.mute?0:a.volume;
        el.currentTime=t-a.offset;
        audioElements.set(a.id,el);
        if(isPlaying) el.play().catch(()=>{});
      } else {
        const target=t-a.offset;
        if(Math.abs(el.currentTime-target)>0.25) el.currentTime=target;
        el.volume=a.mute?0:a.volume;
        if(isPlaying && el.paused) el.play().catch(()=>{});
      }
    } else if(el){
      el.pause(); audioElements.delete(a.id);
    }
  });
}
function stopAllAudio(){ audioElements.forEach(a=>a.pause()); audioElements.clear(); }

/* Snapping & Dragging */
let dragObj=null;
function snapTime(raw){
  const targets=[];
  project.videoClips.forEach(c=>targets.push(c.start,c.end));
  project.overlays.forEach(o=>targets.push(o.start,o.end));
  project.audioClips.forEach(a=>targets.push(a.offset,a.offset+a.duration));
  targets.push(globalTime);
  let best=raw,min=project.ui.snapTolerance;
  targets.forEach(t=>{const d=Math.abs(t-raw);if(d<min){min=d;best=t;}});
  return best;
}
function startClipDrag(e,clip){
  const edge=e.target.classList.contains('handle')?e.target.dataset.edge:null;
  dragObj={type:'video',id:clip.id,edge,startX:e.clientX,startStart:clip.start,startIn:clip.in,startOut:clip.out};
  snapshot('clipDrag');
  document.addEventListener('mousemove',clipDragMove);
  document.addEventListener('mouseup',clipDragEnd);
  selectVideo(clip.id);
  pause();
}
function clipDragMove(e){
  if(!dragObj)return;
  const clip=project.videoClips.find(c=>c.id===dragObj.id);
  const dt=(e.clientX-dragObj.startX)/pps();
  if(dragObj.edge==='left'){
    const newIn=Math.min(clip.out-0.1,Math.max(0,dragObj.startIn+dt));
    const delta=newIn - clip.in;
    clip.in=newIn;
    clip.start=snapTime(dragObj.startStart+delta);
    clip.end=clip.start+(clip.out-clip.in);
  } else if(dragObj.edge==='right'){
    clip.out=Math.max(clip.in+0.1,Math.min(clip.duration,dragObj.startOut+dt));
    clip.end=clip.start+(clip.out-clip.in);
  } else {
    clip.start=snapTime(dragObj.startStart+dt);
    clip.end=clip.start+(clip.out-clip.in);
  }
  buildVideoClips(); updateTime(true);
}
function clipDragEnd(){
  dragObj=null; flushSnapshot();
  document.removeEventListener('mousemove',clipDragMove);
  document.removeEventListener('mouseup',clipDragEnd);
}
function startOverlayClipDrag(e,o){
  const edge=e.target.classList.contains('handle')?e.target.dataset.edge:null;
  dragObj={type:'overlay',id:o.id,edge,startX:e.clientX,startStart:o.start,startEnd:o.end};
  snapshot('ovDrag');
  document.addEventListener('mousemove',overlayClipMove);
  document.addEventListener('mouseup',overlayClipEnd);
  selectOverlay(o.id);
  pause();
}
function overlayClipMove(e){
  if(!dragObj)return;
  const o=project.overlays.find(x=>x.id===dragObj.id);
  const dt=(e.clientX-dragObj.startX)/pps();
  if(dragObj.edge==='left'){
    o.start=snapTime(Math.max(0,dragObj.startStart+dt));
    if(o.start>o.end-0.05)o.start=o.end-0.05;
  } else if(dragObj.edge==='right'){
    o.end=snapTime(Math.max(o.start+0.05,dragObj.startEnd+dt));
  } else {
    const len=o.end-o.start;
    o.start=snapTime(Math.max(0,dragObj.startStart+dt));
    o.end=o.start+len;
  }
  buildOverlayClips(); updateTime(true);
}
function overlayClipEnd(){
  dragObj=null; flushSnapshot();
  document.removeEventListener('mousemove',overlayClipMove);
  document.removeEventListener('mouseup',overlayClipEnd);
}
function startAudioClipDrag(e,a){
  const edge=e.target.classList.contains('handle')?e.target.dataset.edge:null;
  dragObj={type:'audio',id:a.id,edge,startX:e.clientX,startOffset:a.offset,startDuration:a.duration};
  snapshot('audDrag');
  document.addEventListener('mousemove',audioDragMove);
  document.addEventListener('mouseup',audioDragEnd);
  selectAudio(a.id); pause();
}
function audioDragMove(e){
  if(!dragObj)return;
  const a=project.audioClips.find(x=>x.id===dragObj.id);
  const dt=(e.clientX-dragObj.startX)/pps();
  if(dragObj.edge==='left'){
    a.offset=snapTime(Math.max(0,dragObj.startOffset+dt));
  } else if(dragObj.edge==='right'){
    a.duration=Math.max(0.2,dragObj.startDuration+dt);
  } else {
    a.offset=snapTime(Math.max(0,dragObj.startOffset+dt));
  }
  buildAudioClips(); updateTime(true);
}
function audioDragEnd(){
  dragObj=null; flushSnapshot();
  document.removeEventListener('mousemove',audioDragMove);
  document.removeEventListener('mouseup',audioDragEnd);
}

/* Split / Delete / Duplicate */
function splitSelected(){
  if(!selectedVideoId)return;
  const clip=project.videoClips.find(c=>c.id===selectedVideoId);
  const t=globalTime;
  if(!clip||t<=clip.start+0.05||t>=clip.end-0.05)return;
  const rel=clip.in+(t-clip.start);
  const first={...clip,id:genId('v1'),out:rel,end:clip.start+(rel-clip.in)};
  const second={...clip,id:genId('v2'),in:rel,start:first.end,end:first.end+(clip.out-rel)};
  const idx=project.videoClips.indexOf(clip);
  project.videoClips.splice(idx,1,first,second);
  snapshot('split'); buildVideoClips(); selectVideo(first.id);
}
function deleteSelected(){
  if(selectedVideoId){
    const clip=project.videoClips.find(c=>c.id===selectedVideoId);
    const idx=project.videoClips.indexOf(clip);
    if(idx>=0){
      const removed=clip.end-clip.start;
      URL.revokeObjectURL(clip.src);
      project.videoClips.splice(idx,1);
      if(rippleDelete){
        for(let i=idx;i<project.videoClips.length;i++){
          project.videoClips[i].start-=removed;
          project.videoClips[i].end-=removed;
        }
      }
      snapshot('delClip'); selectedVideoId=null; rebuildAll();
    }
  } else if(selectedOverlayId){
    const i=project.overlays.findIndex(o=>o.id===selectedOverlayId);
    if(i>=0){
      if(project.overlays[i].type==='image') URL.revokeObjectURL(project.overlays[i].imageSrc);
      project.overlays.splice(i,1);
      snapshot('delOverlay'); selectedOverlayId=null; rebuildAll();
    }
  } else if(selectedAudioId){
    const i=project.audioClips.findIndex(a=>a.id===selectedAudioId);
    if(i>=0){
      URL.revokeObjectURL(project.audioClips[i].src);
      project.audioClips.splice(i,1);
      snapshot('delAudio'); selectedAudioId=null; rebuildAll();
    }
  }
}
function duplicateSelected(){
  if(selectedVideoId){
    const clip=project.videoClips.find(c=>c.id===selectedVideoId);
    if(!clip)return;
    const dup={...clip,id:genId('vdup'),start:clip.end+0.1,end:clip.end+0.1+(clip.out-clip.in)};
    project.videoClips.push(dup);
    snapshot('dupVid'); rebuildAll(); selectVideo(dup.id);
  } else if(selectedOverlayId){
    const o=project.overlays.find(v=>v.id===selectedOverlayId);
    if(!o)return;
    const dup={...o,id:genId('ovdup'),x:o.x+30,y:o.y+30};
    project.overlays.push(dup);
    snapshot('dupOv'); rebuildAll(); selectOverlay(dup.id);
  }
}

/* Trim buttons */
btnClipInSet.addEventListener('click',()=>{
  if(!selectedVideoId)return;
  const c=project.videoClips.find(v=>v.id===selectedVideoId);
  const rel=c.in+(globalTime-c.start);
  if(rel>=c.out-0.05)return;
  c.in=rel; c.end=c.start+(c.out-c.in);
  snapshot('trimIn'); buildVideoClips(); updateInspector(); updateTime(true);
});
btnClipOutSet.addEventListener('click',()=>{
  if(!selectedVideoId)return;
  const c=project.videoClips.find(v=>v.id===selectedVideoId);
  const rel=c.in+(globalTime-c.start);
  if(rel<=c.in+0.05||rel>c.duration)return;
  c.out=rel; c.end=c.start+(c.out-c.in);
  snapshot('trimOut'); buildVideoClips(); updateInspector(); updateTime(true);
});
btnFitToRange.addEventListener('click',()=>{
  if(!selectedVideoId)return;
  if(project.inPoint==null||project.outPoint==null)return;
  const c=project.videoClips.find(v=>v.id===selectedVideoId);
  const newLen=project.outPoint-project.inPoint;
  if(newLen<0.05)return;
  c.in=Math.min(c.duration-newLen,c.in);
  c.out=c.in+newLen;
  c.start=project.inPoint;
  c.end=c.start+(c.out-c.in);
  snapshot('fitRange'); rebuildAll(); selectVideo(c.id);
});

/* Imports */
inputVideo.addEventListener('change',e=>{
  const files=[...e.target.files];let loaded=0;
  files.forEach(f=>{
    const url=URL.createObjectURL(f);
    const tmp=document.createElement('video');
    tmp.src=url;
    tmp.addEventListener('loadedmetadata',()=>{
      const start=project.videoClips.length?project.videoClips.at(-1).end:0;
      const dur=tmp.duration||0;
      project.videoClips.push({id:genId('v'),src:url,name:f.name,duration:dur,in:0,out:dur,start,end:start+dur});
      loaded++;
      if(loaded===files.length){snapshot('importVideo');rebuildAll();}
    },{once:true});
  });
  e.target.value='';
});
inputAudio.addEventListener('change',e=>{
  const files=[...e.target.files];let loaded=0;
  files.forEach(f=>{
    const url=URL.createObjectURL(f);
    const tmp=new Audio(url);
    tmp.addEventListener('loadedmetadata',()=>{
      project.audioClips.push({
        id:genId('a'),src:url,name:f.name,duration:tmp.duration||0,
        offset:project.audioClips.reduce((m,a)=>Math.max(m,a.offset+a.duration),0),
        volume:1,mute:false
      });
      loaded++;
      if(loaded===files.length){snapshot('importAudio');buildAudioClips();updateTime(true);}
    },{once:true});
  });
  e.target.value='';
});
inputImage.addEventListener('change',e=>{
  [...e.target.files].forEach(f=>{
    const url=URL.createObjectURL(f);
    project.overlays.push({
      id:genId('img'),type:'image',imageSrc:url,start:globalTime,end:globalTime+5,
      x:120,y:120,scale:1,opacity:1,fontSize:32,color:'#ffffff',fontFamily:'Arial',visible:true,locked:false,blend:'normal'
    });
  });
  snapshot('importImages');rebuildAll();e.target.value='';
});
addTextBtn.addEventListener('click',()=>{
  const o={id:genId('txt'),type:'text',text:'New Text',start:globalTime,end:globalTime+5,
           x:100,y:100,scale:1,opacity:1,fontSize:32,color:'#ffffff',fontFamily:'Arial',visible:true,locked:false,blend:'normal'};
  project.overlays.push(o);
  snapshot('addText'); rebuildAll(); selectOverlay(o.id);
});

/* Buttons */
splitBtn.addEventListener('click',splitSelected);
deleteBtn.addEventListener('click',deleteSelected);
duplicateBtn.addEventListener('click',duplicateSelected);
undoBtn.addEventListener('click',undo);
redoBtn.addEventListener('click',redo);
timelineZoom.addEventListener('input',e=>{
  project.settings.pixelsPerSecond=parseInt(e.target.value,10);
  snapshot('zoom'); rebuildAll();
});
markInBtn.addEventListener('click',()=>{project.inPoint=globalTime;validateRange();snapshot('setIn');});
markOutBtn.addEventListener('click',()=>{project.outPoint=globalTime;validateRange();snapshot('setOut');});
loopBtn.addEventListener('click',()=>{project.loop=!project.loop;loopBtn.textContent='Loop: '+(project.loop?'On':'Off');snapshot('loop');});
rippleBtn.addEventListener('click',()=>{rippleDelete=!rippleDelete;rippleBtn.textContent='Ripple: '+(rippleDelete?'On':'Off');});

/* Playhead Scrub */
playheadEl.addEventListener('mousedown',e=>{
  draggingPlayhead=true;
  pause();
  document.addEventListener('mousemove',playheadMove);
  document.addEventListener('mouseup',playheadUp);
});
function playheadMove(e){
  const rect=timeRuler.getBoundingClientRect();
  let x=e.clientX - rect.left;
  if(x<0)x=0;
  const maxPx=t2x(projectDuration());
  if(x>maxPx)x=maxPx;
  globalTime=x2t(x);
  const c=findClipAt(globalTime);
  if(c){
    activateClip(c,true);
    currentVideo.pause();
    currentVideo.currentTime=c.in + (globalTime - c.start);
  } else enterGapMode();
  updateAudioPlay(globalTime);
  updateTime(true);
}
function playheadUp(){
  draggingPlayhead=false;
  document.removeEventListener('mousemove',playheadMove);
  document.removeEventListener('mouseup',playheadUp);
}

/* Export */
exportBtn.addEventListener('click',()=>{
  const blob=new Blob([JSON.stringify(project,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='project.json';
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),3000);
});

/* Render */
let rendering=false,cancelRender=false,recordedBlob=null;
renderBtn.addEventListener('click',()=>renderModal.classList.remove('hidden'));
closeRenderBtn.addEventListener('click',()=>{ if(!rendering) renderModal.classList.add('hidden'); });
startRenderBtn.addEventListener('click',startRender);
cancelRenderBtn.addEventListener('click',()=>cancelRender=true);
downloadRenderBtn.addEventListener('click',()=>{
  if(recordedBlob){
    const a=document.createElement('a');
    a.href=URL.createObjectURL(recordedBlob);
    a.download='rendered.webm';
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),3000);
  }
});

async function mixAudioOffline(start,end){
  const clips=project.audioClips.filter(a=>(a.offset+a.duration)>start && a.offset<end && !a.mute);
  if(!clips.length) return null;
  const sr=44100;
  const len=Math.ceil((end-start)*sr);
  const ctx=new OfflineAudioContext(2,len,sr);
  for(const clip of clips){
    const relOffset=Math.max(0,clip.offset-start);
    const effStart=Math.max(0,start-clip.offset);
    const playDur=Math.min(clip.duration-effStart,end-clip.offset);
    if(playDur<=0)continue;
    let buf;
    try{
      const ab=await fetch(clip.src).then(r=>r.arrayBuffer());
      buf=await ctx.decodeAudioData(ab.slice(0));
    }catch{continue;}
    const startSample=Math.floor(effStart*buf.sampleRate);
    const sliceLen=Math.floor(playDur*buf.sampleRate);
    const tmp=ctx.createBuffer(buf.numberOfChannels,sliceLen,buf.sampleRate);
    for(let ch=0;ch<buf.numberOfChannels;ch++){
      const s=buf.getChannelData(ch);
      const d=tmp.getChannelData(ch);
      for(let i=0;i<sliceLen;i++) d[i]=s[startSample+i]||0;
    }
    const srcNode=ctx.createBufferSource(); srcNode.buffer=tmp;
    const gain=ctx.createGain(); gain.gain.value=clip.volume;
    srcNode.connect(gain).connect(ctx.destination);
    srcNode.start(relOffset);
  }
  return await ctx.startRendering();
}

async function startRender(){
  if(rendering) return;
  const pd=projectDuration();
  if(pd<=0){ renderStatus.textContent='Nothing to render.'; return; }
  const range=renderRangeSel.value;
  const start=(range==='range'&&project.inPoint!=null)?project.inPoint:0;
  const end  =(range==='range'&&project.outPoint!=null)?project.outPoint:pd;
  if(end<=start+0.05){ renderStatus.textContent='Invalid range.'; return; }

  const fps=parseInt(renderFPSSel.value,10)||30;
  const [rw,rh]=renderResSel.value.split('x').map(n=>parseInt(n,10));
  const includeAudio=renderAudioChk.checked;
  const includeOverlays=renderOverlaysChk.checked;

  renderCanvas.width=rw; renderCanvas.height=rh;
  renderCanvas.classList.remove('hidden');
  startRenderBtn.classList.add('hidden');
  cancelRenderBtn.classList.remove('hidden');
  downloadRenderBtn.classList.add('hidden');
  renderProgress.classList.remove('hidden');
  renderStatus.textContent='Rendering...';
  renderFill.style.width='0%'; renderPct.textContent='0%'; renderElapsed.textContent='0.0s';
  cancelRender=false; rendering=true; recordedBlob=null;

  let audioBuf=null;
  if(includeAudio && project.audioClips.length){
    try{ audioBuf=await mixAudioOffline(start,end); }
    catch(e){ console.warn('Audio mix failed',e); renderStatus.textContent='Audio mix failed (video only)'; }
  }

  const stream=renderCanvas.captureStream(fps);
  if(audioBuf){
    const ac=new (window.AudioContext||window.webkitAudioContext)();
    const dest=ac.createMediaStreamDestination();
    const src=ac.createBufferSource();
    src.buffer=audioBuf;
    src.connect(dest);
    src.start(0);
    stream.addTrack(dest.stream.getAudioTracks()[0]);
  }

  const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9,opus'});
  const chunks=[];
  recorder.ondataavailable=e=>{ if(e.data.size>0) chunks.push(e.data); };
  recorder.onstop=()=>{
    recordedBlob=new Blob(chunks,{type:'video/webm'});
    if(!cancelRender){
      renderStatus.textContent='Render complete.';
      downloadRenderBtn.classList.remove('hidden');
    }else renderStatus.textContent='Cancelled.';
    cancelRenderBtn.classList.add('hidden');
    rendering=false;
  };
  recorder.start();

  const frameDur=1/fps;
  const frames=Math.ceil((end-start)/frameDur);
  const startPerf=performance.now();
  const rv=document.createElement('video');
  rv.playsInline=true; rv.muted=true; rv.crossOrigin='anonymous';

  async function seekVideo(video,time){
    return new Promise(res=>{
      let done=false;
      function finish(){ if(done)return; done=true; video.removeEventListener('seeked',finish); res(); }
      video.addEventListener('seeked',finish);
      try{ video.currentTime=Math.min(time, video.duration||time); }catch{finish();}
      setTimeout(finish,350);
    });
  }
  function drawContain(v,W,H){
    const vw=v.videoWidth||1,vh=v.videoHeight||1;
    const vr=vw/vh,cr=W/H;
    let dw,dh;
    if(vr>cr){dw=W;dh=W/vr;}else{dh=H;dw=H*vr;}
    const dx=(W-dw)/2,dy=(H-dh)/2;
    rctx.drawImage(v,dx,dy,dw,dh);
  }
  function findClipAtRender(t){
    return project.videoClips.find(c=>t>=c.start && t<c.end) || null;
  }
  async function drawFrame(t){
    rctx.fillStyle='#000'; rctx.fillRect(0,0,rw,rh);
    const clip=findClipAtRender(t);
    if(clip){
      const rel=clip.in + (t - clip.start);
      if(rv.src!==clip.src){
        rv.src=clip.src;
        await new Promise(r=>{ rv.onloadedmetadata=()=>r(); rv.load(); });
      }
      await seekVideo(rv,rel);
      drawContain(rv,rw,rh);
    }
    if(includeOverlays){
      project.overlays.forEach(o=>{
        if(!o.visible)return;
        if(t>=o.start && t<o.end){
          rctx.save();
          rctx.globalAlpha=o.opacity;
          rctx.translate(o.x,o.y);
          rctx.scale(o.scale,o.scale);
          if(o.type==='text'){
            rctx.font=`${o.fontSize}px ${o.fontFamily||'Arial'}`;
            rctx.fillStyle=o.color;
            rctx.textBaseline='top';
            rctx.fillText(o.text,0,0);
          } else if(o.type==='image'){
            const img=new Image(); img.src=o.imageSrc;
            if(img.complete) rctx.drawImage(img,0,0);
            else img.onload=()=>rctx.drawImage(img,0,0);
          }
          rctx.restore();
        }
      });
    }
  }

  for(let i=0;i<=frames;i++){
    if(cancelRender)break;
    const t=start+i*frameDur;
    await drawFrame(Math.min(t,end-1e-6));
    const prog=i/frames;
    renderFill.style.width=(prog*100).toFixed(1)+'%';
    renderPct.textContent=(prog*100).toFixed(1)+'%';
    renderElapsed.textContent=((performance.now()-startPerf)/1000).toFixed(1)+'s';
    await new Promise(r=>requestAnimationFrame(r));
  }

  recorder.stop();
  if(cancelRender) renderStatus.textContent='Cancelled.';
}

/* Keyboard */
window.addEventListener('keydown',e=>{
  if(e.target.matches('input,textarea'))return;
  switch(e.key.toLowerCase()){
    case ' ': e.preventDefault(); isPlaying?pause():play(); break;
    case 'i': project.inPoint=globalTime; validateRange(); snapshot('in'); break;
    case 'o': project.outPoint=globalTime; validateRange(); snapshot('out'); break;
    case 'l': project.loop=!project.loop; loopBtn.textContent='Loop: '+(project.loop?'On':'Off'); snapshot('loop'); break;
    case 'c': splitSelected(); break;
    case 'delete':
    case 'backspace': deleteSelected(); break;
    case 'd': if(e.ctrlKey||e.metaKey){ e.preventDefault(); duplicateSelected(); } break;
    case 'arrowleft': stepFrame(-1); break;
    case 'arrowright': stepFrame(1); break;
    case 'z': if(e.ctrlKey||e.metaKey){ e.preventDefault(); undo(); } break;
    case 'y': if(e.ctrlKey||e.metaKey){ e.preventDefault(); redo(); } break;
    case 'r': if(e.shiftKey){ e.preventDefault(); replayBtn.click(); } break;
  }
});

/* Init */
function init(){
  snapshot('init',true);
  rebuildAll();
  updateUndoRedo();
}
init();

/* Expose */
window.project=project;