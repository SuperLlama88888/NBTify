export type Tag = number | bigint | boolean | string | CompoundTag | NumericArray | Array<Tag>;

export type RootTag = CompoundTag | Array<Tag>;

export type RootTagLike = CompoundTag | Array<Tag>;

export interface CompoundTag {
  [name: string]: Tag | undefined;
}

export type NumericArray = Int8Array | Int16Array | Int32Array | BigInt64Array | Float32Array | Float64Array;

export type NumericArrayConstructor = typeof Int8Array | typeof Int16Array | typeof Int32Array | typeof BigInt64Array | typeof Float32Array | typeof Float64Array;

export enum TAG {
  END = 0,
  BYTE,
  SHORT,
  INT,
  LONG,
  FLOAT,
  DOUBLE,
  BYTE_ARRAY,
  STRING,
  LIST,
  COMPOUND,
  INT_ARRAY,
  LONG_ARRAY
}

Object.freeze(TAG);

export const TAG_TYPE = Symbol("nbtify.tag.type");

export function isTagType(type: unknown): type is TAG {
  return typeof type === "number" && type in TAG;
}

export function getAppropriateTypedArray(type: TAG): NumericArrayConstructor | null {
  switch (type) {
    case TAG.BYTE: return Int8Array;
    case TAG.SHORT: return Int16Array;
    case TAG.INT: return Int32Array;
    case TAG.LONG: return BigInt64Array;
    case TAG.FLOAT: return Float32Array;
    case TAG.DOUBLE: return Float64Array;
  }
  return null;
}