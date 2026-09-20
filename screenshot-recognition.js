(function(root,factory){
  'use strict';
  const api=factory(root);
  if(typeof module==='object'&&module.exports) module.exports=api;
  root.PCScreenshotRecognition=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  const BASE_IMAGE={width:3392,height:2400};
  const TARGET_ASPECT=16/9;
  const SHAPE_SIZE=16;
  const COLOR_SIZE=8;
  const DEFAULT_CACHE_KEY='championCoach.screenshotRefs.v1';
  const ENEMY_RECTS=[
    {left:2774,top:512,right:3050,bottom:716},
    {left:2774,top:738,right:3050,bottom:941},
    {left:2774,top:962,right:3050,bottom:1166},
    {left:2774,top:1186,right:3050,bottom:1388},
    {left:2774,top:1411,right:3050,bottom:1611},
    {left:2774,top:1637,right:3050,bottom:1835}
  ];
  const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));

  function centeredAspectViewport(width,height,aspect){
    const target=aspect||TARGET_ASPECT,ratio=width/height;
    if(Math.abs(ratio-target)<0.001)return {left:0,top:0,width,height};
    if(ratio>target){const w=Math.round(height*target);return {left:Math.round((width-w)/2),top:0,width:w,height};}
    const h=Math.round(width/target);return {left:0,top:Math.round((height-h)/2),width,height:h};
  }

  function mapBaseRect(rect,width,height){
    const source=centeredAspectViewport(BASE_IMAGE.width,BASE_IMAGE.height,TARGET_ASPECT);
    const target=centeredAspectViewport(width,height,TARGET_ASPECT);
    const x0=(rect.left-source.left)/source.width,y0=(rect.top-source.top)/source.height;
    const x1=(rect.right-source.left)/source.width,y1=(rect.bottom-source.top)/source.height;
    const left=Math.round(target.left+x0*target.width),top=Math.round(target.top+y0*target.height);
    const right=Math.round(target.left+x1*target.width),bottom=Math.round(target.top+y1*target.height);
    const cl=clamp(left,0,width-1),ct=clamp(top,0,height-1);
    return {left:cl,top:ct,width:Math.max(1,clamp(right,1,width)-cl),height:Math.max(1,clamp(bottom,1,height)-ct)};
  }

  function cropRGBA(img,rect){
    const out=new Uint8ClampedArray(rect.width*rect.height*4);
    for(let y=0;y<rect.height;y++)for(let x=0;x<rect.width;x++){
      const si=((rect.top+y)*img.width+rect.left+x)*4,di=(y*rect.width+x)*4;
      out[di]=img.data[si];out[di+1]=img.data[si+1];out[di+2]=img.data[si+2];out[di+3]=img.data[si+3]??255;
    }
    return out;
  }

  function borderPalette(rgba,w,h){
    const map=new Map();
    const add=(x,y)=>{const i=(y*w+x)*4,r=rgba[i],g=rgba[i+1],b=rgba[i+2],key=(r>>4)+'_'+(g>>4)+'_'+(b>>4);if(!map.has(key))map.set(key,[r,g,b]);};
    for(let x=0;x<w;x++){add(x,0);add(x,h-1);}for(let y=0;y<h;y++){add(0,y);add(w-1,y);}
    return [...map.values()];
  }

  function removeEnemyPanelBackground(rgba,w,h){
    const out=new Uint8ClampedArray(rgba),palette=borderPalette(out,w,h),tol2=52*52;
    const bg=k=>{
      const i=k*4,r=out[i],g=out[i+1],b=out[i+2];
      if(r>45&&r>g*1.25&&r>b*1.06)return true;
      for(const p of palette){const dr=r-p[0],dg=g-p[1],db=b-p[2];if(dr*dr+dg*dg+db*db<tol2)return true;}
      return false;
    };
    const seen=new Uint8Array(w*h),stack=[];
    const seed=k=>{if(k>=0&&k<w*h&&!seen[k]&&bg(k)){seen[k]=1;stack.push(k);}};
    for(let x=0;x<w;x++){seed(x);seed((h-1)*w+x);}for(let y=0;y<h;y++){seed(y*w);seed(y*w+w-1);}
    while(stack.length){const k=stack.pop(),x=k%w,y=(k/w)|0;if(x>0)seed(k-1);if(x<w-1)seed(k+1);if(y>0)seed(k-w);if(y<h-1)seed(k+w);}
    for(let k=0;k<w*h;k++)if(seen[k])out[k*4+3]=0;
    return out;
  }

  function keepLargestComponent(rgba,w,h){
    const out=new Uint8ClampedArray(rgba),label=new Int32Array(w*h);label.fill(-1);
    let best=-1,bestSize=0;
    for(let start=0;start<w*h;start++){
      if(label[start]!==-1||out[start*4+3]<=16)continue;
      const stack=[start];label[start]=start;let size=0;
      while(stack.length){
        const k=stack.pop();size++;const x=k%w,y=(k/w)|0;
        const ns=[x>0?k-1:-1,x<w-1?k+1:-1,y>0?k-w:-1,y<h-1?k+w:-1];
        for(const n of ns)if(n>=0&&label[n]===-1&&out[n*4+3]>16){label[n]=start;stack.push(n);}
      }
      if(size>bestSize){bestSize=size;best=start;}
    }
    if(best<0)return out;
    for(let k=0;k<w*h;k++)if(label[k]!==best)out[k*4+3]=0;
    return out;
  }

  function foregroundBBox(rgba,w,h){
    const rows=new Uint16Array(h),cols=new Uint16Array(w);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(rgba[(y*w+x)*4+3]>16){rows[y]++;cols[x]++;}
    let maxR=0,maxC=0;for(const v of rows)if(v>maxR)maxR=v;for(const v of cols)if(v>maxC)maxC=v;
    if(!maxR||!maxC)return {x:0,y:0,w,h};
    const rt=Math.max(1,maxR*0.06),ct=Math.max(1,maxC*0.06);let y0=0,y1=h-1,x0=0,x1=w-1;
    while(y0<h&&rows[y0]<rt)y0++;while(y1>y0&&rows[y1]<rt)y1--;while(x0<w&&cols[x0]<ct)x0++;while(x1>x0&&cols[x1]<ct)x1--;
    return {x:x0,y:y0,w:x1-x0+1,h:y1-y0+1};
  }

  function makeGrayThumb(rgba,w,h){
    const box=foregroundBBox(rgba,w,h),side=Math.max(box.w,box.h),sq=new Float32Array(side*side);sq.fill(128);
    const ox=(side-box.w)>>1,oy=(side-box.h)>>1;
    for(let y=0;y<box.h;y++)for(let x=0;x<box.w;x++){
      const i=((box.y+y)*w+box.x+x)*4,a=rgba[i+3]/255;
      const r=rgba[i]*a+128*(1-a),g=rgba[i+1]*a+128*(1-a),b=rgba[i+2]*a+128*(1-a);
      sq[(oy+y)*side+ox+x]=0.299*r+0.587*g+0.114*b;
    }
    const out=new Uint8Array(SHAPE_SIZE*SHAPE_SIZE);
    for(let ty=0;ty<SHAPE_SIZE;ty++)for(let tx=0;tx<SHAPE_SIZE;tx++){
      const y0=Math.floor(ty*side/SHAPE_SIZE),y1=Math.max(y0+1,Math.floor((ty+1)*side/SHAPE_SIZE));
      const x0=Math.floor(tx*side/SHAPE_SIZE),x1=Math.max(x0+1,Math.floor((tx+1)*side/SHAPE_SIZE));
      let sum=0,n=0;for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){sum+=sq[y*side+x];n++;}out[ty*SHAPE_SIZE+tx]=Math.round(sum/(n||1));
    }
    return out;
  }

  function makeColorThumb(rgba,w,h){
    const box=foregroundBBox(rgba,w,h),side=Math.max(box.w,box.h),sq=new Float32Array(side*side*3);sq.fill(128);
    const ox=(side-box.w)>>1,oy=(side-box.h)>>1;
    for(let y=0;y<box.h;y++)for(let x=0;x<box.w;x++){
      const i=((box.y+y)*w+box.x+x)*4,a=rgba[i+3]/255,d=((oy+y)*side+ox+x)*3;
      sq[d]=rgba[i]*a+128*(1-a);sq[d+1]=rgba[i+1]*a+128*(1-a);sq[d+2]=rgba[i+2]*a+128*(1-a);
    }
    const out=new Uint8Array(COLOR_SIZE*COLOR_SIZE*3);
    for(let ty=0;ty<COLOR_SIZE;ty++)for(let tx=0;tx<COLOR_SIZE;tx++){
      const y0=Math.floor(ty*side/COLOR_SIZE),y1=Math.max(y0+1,Math.floor((ty+1)*side/COLOR_SIZE));
      const x0=Math.floor(tx*side/COLOR_SIZE),x1=Math.max(x0+1,Math.floor((tx+1)*side/COLOR_SIZE));
      let sr=0,sg=0,sb=0,n=0;for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const d=(y*side+x)*3;sr+=sq[d];sg+=sq[d+1];sb+=sq[d+2];n++;}
      const o=(ty*COLOR_SIZE+tx)*3;out[o]=Math.round(sr/(n||1));out[o+1]=Math.round(sg/(n||1));out[o+2]=Math.round(sb/(n||1));
    }
    return out;
  }

  const fingerprint=(rgba,w,h)=>({shape:makeGrayThumb(rgba,w,h),color:makeColorThumb(rgba,w,h)});
  function flipH(rgba,w,h){const out=new Uint8ClampedArray(rgba.length);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const s=(y*w+x)*4,d=(y*w+w-1-x)*4;out[d]=rgba[s];out[d+1]=rgba[s+1];out[d+2]=rgba[s+2];out[d+3]=rgba[s+3];}return out;}
  function normalize(a){const v=new Float32Array(a.length);let mean=0;for(const x of a)mean+=x;mean/=a.length||1;let norm=0;for(let i=0;i<a.length;i++){v[i]=a[i]-mean;norm+=v[i]*v[i];}norm=Math.sqrt(norm)||1;for(let i=0;i<v.length;i++)v[i]/=norm;return v;}
  function cosine(a,b){let s=0;for(let i=0;i<a.length;i++)s+=a[i]*b[i];return s;}
  function hydrate(ref){if(!ref._shapeVec){ref._shapeVec=normalize(ref.shape);ref._colorVec=normalize(ref.color);}return ref;}

  function rankFingerprints(fps,references,limit){
    const source=fps.map(fp=>({shape:normalize(fp.shape),color:normalize(fp.color)})),scored=[];
    for(const raw of references){
      const ref=hydrate(raw);let best=-1;
      for(const fp of source){const score=cosine(fp.shape,ref._shapeVec)*0.58+cosine(fp.color,ref._colorVec)*0.42;if(score>best)best=score;}
      scored.push({species:ref.species,score:best});
    }
    scored.sort((a,b)=>b.score-a.score);return scored.slice(0,limit||3);
  }

  function alphaCount(rgba){let n=0;for(let i=3;i<rgba.length;i+=4)if(rgba[i]>16)n++;return n;}
  function recognizeImageData(img,references){
    const slots=ENEMY_RECTS.map((baseRect,index)=>{
      const rect=mapBaseRect(baseRect,img.width,img.height);
      let rgba=cropRGBA(img,rect);rgba=removeEnemyPanelBackground(rgba,rect.width,rect.height);rgba=keepLargestComponent(rgba,rect.width,rect.height);
      if(alphaCount(rgba)<24)return {index,rect,candidates:[],accepted:false,score:0,margin:0};
      const normal=fingerprint(rgba,rect.width,rect.height),mirrored=fingerprint(flipH(rgba,rect.width,rect.height),rect.width,rect.height);
      const candidates=rankFingerprints([normal,mirrored],references,3),first=candidates[0],second=candidates[1];
      const score=first?first.score:0,margin=first&&second?first.score-second.score:0,accepted=!!first&&score>=0.78&&margin>=0.035;
      return {index,rect,candidates,accepted,score,margin};
    });
    return {slots,recognized:slots.filter(s=>s.candidates.length).length,accepted:slots.filter(s=>s.accepted).length};
  }

  async function blobToImageData(blob){
    if(!root.createImageBitmap||!root.document)throw new Error('このブラウザでは画像解析を利用できません。');
    const bitmap=await root.createImageBitmap(blob,{colorSpaceConversion:'none'}),canvas=root.document.createElement('canvas');
    canvas.width=bitmap.width;canvas.height=bitmap.height;const ctx=canvas.getContext('2d',{willReadFrequently:true});
    if(!ctx){bitmap.close&&bitmap.close();throw new Error('画像解析用Canvasを作成できません。');}
    ctx.drawImage(bitmap,0,0);bitmap.close&&bitmap.close();const data=ctx.getImageData(0,0,canvas.width,canvas.height);
    return {data:data.data,width:data.width,height:data.height};
  }
  const recognizeBlob=async(blob,references)=>recognizeImageData(await blobToImageData(blob),references);

  function bytesToBase64(bytes){let s='';for(let i=0;i<bytes.length;i++)s+=String.fromCharCode(bytes[i]);if(typeof btoa==='function')return btoa(s);if(typeof Buffer!=='undefined')return Buffer.from(bytes).toString('base64');throw new Error('base64 encoder unavailable');}
  function base64ToBytes(text){let s;if(typeof atob==='function')s=atob(text);else if(typeof Buffer!=='undefined')s=Buffer.from(text,'base64').toString('binary');else throw new Error('base64 decoder unavailable');const out=new Uint8Array(s.length);for(let i=0;i<s.length;i++)out[i]=s.charCodeAt(i);return out;}
  const serializeRef=r=>({species:r.species,shape:bytesToBase64(r.shape),color:bytesToBase64(r.color)});
  const deserializeRef=r=>({species:r.species,shape:base64ToBytes(r.shape),color:base64ToBytes(r.color)});
  const signature=catalog=>catalog.map(p=>p.id+':'+p.dex).join('|');

  function loadCachedReferences(catalog,options){
    const opt=options||{},storage=opt.storage||root.localStorage,key=opt.cacheKey||DEFAULT_CACHE_KEY;if(!storage)return [];
    try{const raw=JSON.parse(storage.getItem(key)||'null');if(!raw||raw.version!==1||raw.signature!==signature(catalog)||!Array.isArray(raw.references))return [];return raw.references.map(deserializeRef);}catch(_){return [];}
  }

  async function featureFromUrl(url){
    const response=await root.fetch(url,{cache:'force-cache',mode:'cors'});if(!response.ok)throw new Error('reference fetch '+response.status);
    const img=await blobToImageData(await response.blob());return fingerprint(img.data,img.width,img.height);
  }

  async function prepareReferences(catalog,options){
    const opt=options||{},cached=loadCachedReferences(catalog,opt);if(cached.length)return {references:cached,source:'cache',failures:[]};
    if(!root.fetch)throw new Error('参照画像を取得できません。');
    const refs=new Array(catalog.length),failures=[];let cursor=0,done=0;const concurrency=Math.max(1,Math.min(8,opt.concurrency||6));
    async function worker(){
      while(true){
        const index=cursor++;if(index>=catalog.length)return;const mon=catalog[index],urls=[].concat(opt.urlsFor?opt.urlsFor(mon):[]).filter(Boolean);let fp=null,lastError=null;
        for(const url of urls){try{fp=await featureFromUrl(url);if(fp)break;}catch(e){lastError=e;}}
        if(fp)refs[index]={species:mon.name,shape:fp.shape,color:fp.color};else failures.push({species:mon.name,error:String(lastError||'no reference url')});
        done++;if(opt.onProgress)opt.onProgress(done,catalog.length,mon.name);
      }
    }
    await Promise.all(Array.from({length:concurrency},worker));const references=refs.filter(Boolean);
    if(references.length<Math.ceil(catalog.length*0.7))throw new Error('認識用データを十分に準備できませんでした。');
    const storage=opt.storage||root.localStorage,key=opt.cacheKey||DEFAULT_CACHE_KEY;
    if(storage){try{storage.setItem(key,JSON.stringify({version:1,signature:signature(catalog),createdAt:new Date().toISOString(),references:references.map(serializeRef)}));}catch(_){}}
    return {references,source:'network',failures};
  }

  return {BASE_IMAGE,ENEMY_RECTS,centeredAspectViewport,mapBaseRect,removeEnemyPanelBackground,keepLargestComponent,fingerprint,flipH,rankFingerprints,recognizeImageData,recognizeBlob,loadCachedReferences,prepareReferences,_test:{cropRGBA,foregroundBBox,normalize,cosine,alphaCount}};
});