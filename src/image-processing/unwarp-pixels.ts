/** PaddleX UVDoc accepts original-size BGR / 255 NCHW, and returns the rectified image. */
export function toBgrTensor(rgba:Uint8ClampedArray,width:number,height:number){
 const count=width*height;if(rgba.length!==count*4)throw new Error('图像像素尺寸不匹配');
 const data=new Float32Array(count*3);for(let i=0;i<count;i++){data[i]=rgba[i*4+2]/255;data[count+i]=rgba[i*4+1]/255;data[count*2+i]=rgba[i*4]/255;}return data;
}
export function fromBgrTensor(data:Float32Array,dims:readonly number[]){
 if(dims.length!==4||dims[0]!==1||dims[1]!==3||dims[2]<1||dims[3]<1||dims[2]*dims[3]>5000000)throw new Error('展平模型返回了无效图像尺寸');
 const height=dims[2],width=dims[3],count=width*height;if(data.length!==count*3)throw new Error('展平模型像素数量不匹配');
 const rgba=new Uint8ClampedArray(count*4);for(let i=0;i<count;i++){
  const r=data[count*2+i],g=data[count+i],b=data[i];if(!Number.isFinite(r+g+b))throw new Error('展平模型返回了无效像素');
  rgba[i*4]=Math.round(r*255);rgba[i*4+1]=Math.round(g*255);rgba[i*4+2]=Math.round(b*255);rgba[i*4+3]=255;
 }return {rgba,width,height};
}
