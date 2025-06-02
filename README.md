# NBTify-readonly-typeless

[![npm](https://img.shields.io/npm/v/nbtify-readonly-typeless.svg)](https://www.npmjs.com/package/nbtify-readonly-typeless)

This repository is a fork of [NBTify](https://github.com/Offroaders123/NBTify) with all functionality except reading NBT files removed. Specialised classes for different types (e.g. `Int16 extends Number`, `Float32 extends Number` etc.) have been removed, meaning there is no way to differentiate between different number types. Lists of numbers have also been compacted into `TypedArray`s, which store numbers much more compactly than individual objects for each number.

Overall, it is much more memory efficient and a little bit faster than NBTify, for the cost of being very limited in functionality.

Please refer to [NBTify's readme](https://github.com/Offroaders123/NBTify#readme) for more information.

## Usage
### In the browser:

```html
<script type="importmap">
    {
    "imports": {
      "nbtify-readonly-typeless": "https://esm.sh/nbtify-readonly-typeless@1.1.1" // Remove @1.1.1 to use latest version
    }
  }
</script>
<script type="module">
  import * as NBT from "nbtify-readonly-typeless";
  
  let file = await fetch("./hermitcraft9.mcstructure").then(res => res.blob());
  let nbt = await NBT.read(file);
  console.log(nbt);
</script>
```

#### In Node:

```sh
npm i nbtify-readonly-typeless
```
```ts
import * as NBT from "nbtify-readonly-typeless";
```