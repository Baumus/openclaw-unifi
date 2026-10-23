import {deflateSync} from "node:zlib";
import {writeFileSync} from "node:fs";
// Deterministic 128px original artwork, no external branding/dependencies.
const size=128, raw=Buffer.alloc((size*4+1)*size);
function lineDistance(x,y,x1,y1,x2,y2){const t=Math.max(0,Math.min(1,((x-x1)*(x2-x1)+(y-y1)*(y2-y1))/((x2-x1)**2+(y2-y1)**2)));return Math.hypot(x-(x1+t*(x2-x1)),y-(y1+t*(y2-y1)))}
for(let y=0;y<size;y++)for(let x=0;x<size;x++){
 const at=y*(size*4+1)+1+x*4;
 const bg=(x>=26&&x<102)||(y>=26&&y<102)||Math.hypot(x<64?x-26:x-101,y<64?y-26:y-101)<=26;
 let lit=Math.hypot(x-64,y-99)<=7;
 for(const[x0,y0,x1,y1] of [[24,43,104,43],[38,62,90,62],[52,80,76,80]]){
  let px=x0,py=y0;
  for(let t=0.02;t<=1.001;t+=0.02){const nx=(1-t)**2*x0+2*(1-t)*t*64+t*t*x1,ny=(1-t)**2*y0+2*(1-t)*t*(y0-31)+t*t*y1;if(lineDistance(x,y,px,py,nx,ny)<=4.5)lit=true;px=nx;py=ny;}
 }
 raw[at]=lit?48:19;raw[at+1]=lit?213:40;raw[at+2]=lit?235:61;raw[at+3]=bg?255:0;
}
function crc(buffer){let c=0xffffffff;for(const b of buffer){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0}
function chunk(type,data){const b=Buffer.alloc(data.length+12);b.writeUInt32BE(data.length);b.write(type,4);data.copy(b,8);b.writeUInt32BE(crc(b.subarray(4,8+data.length)),8+data.length);return b}
const hdr=Buffer.alloc(13);hdr.writeUInt32BE(size);hdr.writeUInt32BE(size,4);hdr[8]=8;hdr[9]=6;
writeFileSync(new URL("../assets/icon.png",import.meta.url),Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",hdr),chunk("IDAT",deflateSync(raw)),chunk("IEND",Buffer.alloc(0))]));
