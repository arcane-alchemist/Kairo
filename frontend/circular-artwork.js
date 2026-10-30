export async function circularArtwork(source, document) {
 const image=document.createElement('img');
 image.src=source;
 try {await image.decode();} catch {throw Error('The artwork could not be read. Choose another PNG or JPEG.');}
 if(!image.naturalWidth||!image.naturalHeight)throw Error('The artwork has no readable image dimensions.');
 const canvas=document.createElement('canvas');
 canvas.width=canvas.height=512;
 const context=canvas.getContext('2d');
 if(!context)throw Error('The artwork could not be prepared. Reload the page and try again.');
 const side=Math.min(image.naturalWidth,image.naturalHeight);
 context.beginPath();
 context.arc(256,256,256,0,Math.PI*2);
 context.clip();
 context.drawImage(image,(image.naturalWidth-side)/2,(image.naturalHeight-side)/2,side,side,0,0,512,512);
 return canvas.toDataURL('image/png');
}
