// Offline derivatives of user-provided Downloads photos. Originals are read-only.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),sharp=require('sharp');
const sourceDir=process.argv[2];if(!sourceDir)throw Error('Pass the original-photo directory');
const choices=[
  {
    "file": "IMG_9332.JPG",
    "slug": "pastel-pair",
    "crop": {
      "left": 0,
      "top": 650,
      "width": 2667,
      "height": 3334
    },
    "sha256": "49974cd5f80948e70385513d4fb27a8cbaab870ee87c421c2dcadbe40ade98ea"
  },
  {
    "file": "IMG_9420.JPG",
    "slug": "white-dress",
    "crop": {
      "left": 0,
      "top": 650,
      "width": 2667,
      "height": 3334
    },
    "sha256": "17071b87f68506efb4c5118188fae151f104e57f19719959ea3c2c946955ffb3"
  },
  {
    "file": "IMG_7100.JPG",
    "slug": "black-dress",
    "crop": {
      "left": 0,
      "top": 150,
      "width": 2667,
      "height": 3334
    },
    "sha256": "d733a6b25bfcfaf485bb29dcf645549c492d4d18442e68928d3536fee5ffe2c6"
  }
];
const about={file:'IMG_9491.JPG',sha256:'68e864a4f4d448fd997d1642d24e95ec5c8b0149a2f733cf5ad26e699ca9bff3'};
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
(async()=>{const manifest=[];for(const item of [...choices,about]){const source=fs.readFileSync(path.join(sourceDir,item.file));if(hash(source)!==item.sha256)throw Error('Unexpected source '+item.file);const info=await sharp(source).metadata();const assets=[];
for(const mobile of item.slug?[false,true]:[false]){const dest=item.slug?'public/brand/hero/'+item.slug+(mobile?'-mobile':'-desktop')+'.webp':'public/brand/hero/approved-studio.png';let pipeline=sharp(source).rotate();if(item.slug&&!mobile)pipeline=pipeline.extract(item.crop);
if(item.slug)await pipeline.resize({width:mobile?800:960,withoutEnlargement:true}).webp({quality:84,effort:6}).toFile(dest);else await pipeline.resize({width:640,withoutEnlargement:true}).png({palette:true,quality:90,effort:9}).toFile(dest);
const bytes=fs.readFileSync(dest),meta=await sharp(bytes).metadata();if(bytes.length>(item.slug?220000:400000))throw Error('Asset budget exceeded '+dest);assets.push({path:dest,width:meta.width,height:meta.height,bytes:bytes.length,sha256:hash(bytes)});}
if(hash(fs.readFileSync(path.join(sourceDir,item.file)))!==item.sha256)throw Error('Source changed');manifest.push({...item,width:info.width,height:info.height,bytes:source.length,assets});}
fs.writeFileSync('docs/SHOWROOM_HERO_ASSETS_20261009.json',JSON.stringify({source:'User Downloads/фото для главной старницы сайта',originalsPreserved:true,transform:'orientation, explicit desktop crop, resize, WebP/PNG encoding; metadata stripped; no retouching or text overlays',photos:manifest},null,2)+'\n');console.log(JSON.stringify(manifest,null,2));})().catch(e=>{console.error(e);process.exitCode=1});
