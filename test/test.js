import { read } from "../dist/index.js";
// import {read} from "https://esm.sh/nbtify";

let testFileDirectory = await fetch("./nbts.txt").then(res => res.text());
let testFiles = await Promise.all(testFileDirectory.split("\n").filter(n => !n.endsWith(".snbt")).map(n => fetch(`nbt/${n}`).then(res => res.blob()).then(blob => new File([blob], n))));
console.log(testFiles)

let data = {};
let start = performance.now();
for(let file of testFiles) {
	try {
		let nbt = await read(file);
		data[file.name] = nbt;
	} catch(e) {
		console.log(`Failed for ${file.name}!`, e);
	}
}
console.log(data);
let time = performance.now() - start;
console.log(time / 1000 + "s")
console.log(time / Object.keys(data).length + "ms / file")



/*

tree farm:
current: ~5ms, 322mb
new: ~3.2ms, 210mb

lush cave:
current: 5-6ms, 1214mb
new: ~3.1ms, 177mb

*/