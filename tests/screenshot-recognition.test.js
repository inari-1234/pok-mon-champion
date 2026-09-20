const test=require('node:test');
const assert=require('node:assert/strict');
const R=require('../screenshot-recognition.js');

test('centered 16:9 viewport matches phone mapping',()=>assert.deepEqual(R.centeredAspectViewport(2772,1240),{left:284,top:0,width:2204,height:1240}));
test('opponent slot 0 maps to known phone safe zone',()=>assert.deepEqual(R.mapBaseRect(R.ENEMY_RECTS[0],2772,1240),{left:2087,top:173,width:179,height:132}));
test('base screenshot mapping keeps slot coordinates',()=>assert.deepEqual(R.mapBaseRect(R.ENEMY_RECTS[5],3392,2400),{left:2774,top:1637,width:276,height:198}));

function block(color){
  const w=24,h=24,data=new Uint8ClampedArray(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4,inside=x>=4&&x<=15&&y>=5&&y<=18;data[i]=inside?color[0]:0;data[i+1]=inside?color[1]:0;data[i+2]=inside?color[2]:0;data[i+3]=inside?255:0;}
  return {w,h,data};
}
test('fingerprint ranks identical reference first',()=>{
  const a=block([220,70,40]),b=block([40,90,220]),fa=R.fingerprint(a.data,a.w,a.h),fb=R.fingerprint(b.data,b.w,b.h);
  const ranked=R.rankFingerprints([fa],[{species:'A',shape:fa.shape,color:fa.color},{species:'B',shape:fb.shape,color:fb.color}],2);
  assert.equal(ranked[0].species,'A');assert.ok(ranked[0].score>0.99);
});
test('mirrored candidate can still match when both orientations are supplied',()=>{
  const a=block([210,80,35]),mirrored=R.flipH(a.data,a.w,a.h),ref=R.fingerprint(a.data,a.w,a.h);
  const ranked=R.rankFingerprints([R.fingerprint(mirrored,a.w,a.h),R.fingerprint(R.flipH(mirrored,a.w,a.h),a.w,a.h)],[{species:'A',shape:ref.shape,color:ref.color}],1);
  assert.equal(ranked[0].species,'A');assert.ok(ranked[0].score>0.99);
});
test('red panel removal preserves central non-red foreground',()=>{
  const w=30,h=24,data=new Uint8ClampedArray(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4,inside=x>=9&&x<=20&&y>=5&&y<=18;data[i]=inside?35:105;data[i+1]=inside?180:16;data[i+2]=inside?210:48;data[i+3]=255;}
  const kept=R.keepLargestComponent(R.removeEnemyPanelBackground(data,w,h),w,h),n=R._test.alphaCount(kept);
  assert.ok(n>=120&&n<=190,'foreground count '+n);
});

test('red-orange foreground is not erased with red panel background',()=>{
  const w=30,h=24,data=new Uint8ClampedArray(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=(y*w+x)*4,inside=x>=9&&x<=20&&y>=5&&y<=18;
    data[i]=inside?205:105;data[i+1]=inside?70:16;data[i+2]=inside?35:48;data[i+3]=255;
  }
  const kept=R.keepLargestComponent(R.removeEnemyPanelBackground(data,w,h),w,h);
  assert.ok(R._test.alphaCount(kept)>=100,'red foreground was over-erased');
});
