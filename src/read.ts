import { MUtf8Decoder } from "mutf-8";
import { NBTData } from "./format.js";
import { TAG, getAppropriateTypedArray, isTagType } from "./tag.js";
import { decompress } from "./compression.js";

import type { RootName, Endian, Compression, BedrockLevel } from "./format.js";
import type { Tag, RootTag, RootTagLike, CompoundTag, NumericArray } from "./tag.js";
import { InvalidOpeningTagError, InvalidTagError, UnexpectedBufferEndError, UnexpectedEndTagError, UnexpectedRootNameError, VarNumTooLargeError } from "./errors.js";

export interface ReadOptions {
  rootName: boolean | RootName;
  endian: Endian;
  compression: Compression;
  bedrockLevel: BedrockLevel;
  strict: boolean;
}

/**
 * Converts an NBT buffer into an NBT object. Accepts an endian type, compression format, and file headers to read the data with.
 * 
 * If a format option isn't specified, the function will attempt reading the data using all options until it either throws or returns successfully.
*/
export async function read<T extends RootTagLike = RootTag>(data: Uint8Array | ArrayBufferLike | Blob, options: Partial<ReadOptions> = {}): Promise<NBTData<T>> {
  if (data instanceof Blob) {
    data = await data.arrayBuffer();
  }

  if (!("byteOffset" in data)) {
    data = new Uint8Array(data);
  }

  if (!(data instanceof Uint8Array)) {
    data satisfies never;
    throw new TypeError("First parameter must be a Uint8Array, ArrayBuffer, SharedArrayBuffer, or Blob");
  }

  const reader = new NBTReader(data, options.endian !== "big", options.endian === "little-varint");
  let { rootName, endian, compression, bedrockLevel, strict = true } = options;

  if (rootName !== undefined && typeof rootName !== "boolean" && typeof rootName !== "string" && rootName !== null) {
    rootName satisfies never;
    throw new TypeError("Root Name option must be a boolean, string, or null");
  }
  if (endian !== undefined && endian !== "big" && endian !== "little" && endian !== "little-varint") {
    endian satisfies never;
    throw new TypeError("Endian option must be a valid endian type");
  }
  if (compression !== undefined && compression !== "deflate" && compression !== "deflate-raw" && compression !== "gzip" && compression !== null) {
    compression satisfies never;
    throw new TypeError("Compression option must be a valid compression type");
  }
  if (bedrockLevel !== undefined && typeof bedrockLevel !== "boolean" && typeof bedrockLevel !== "number" && bedrockLevel !== null) {
    bedrockLevel satisfies never;
    throw new TypeError("Bedrock Level option must be a boolean, number, or null");
  }
  if (typeof strict !== "boolean") {
    strict satisfies never;
    throw new TypeError("Strict option must be a boolean");
  }

  compression: if (compression === undefined) {
    switch (true) {
      case reader.hasGzipHeader(): compression = "gzip"; break compression;
      case reader.hasZlibHeader(): compression = "deflate"; break compression;
    }
    try {
      return await read<T>(data, { ...options, compression: null });
    } catch (error) {
      try {
        return await read<T>(data, { ...options, compression: "deflate-raw" });
      } catch {
        throw error;
      }
    }
  }

  compression satisfies Compression;

  if (endian === undefined) {
    try {
      return await read<T>(data, { ...options, endian: "big" });
    } catch (error) {
      try {
        return await read<T>(data, { ...options, endian: "little" });
      } catch {
        try {
          return await read<T>(data, { ...options, endian: "little-varint" });
        } catch {
          throw error;
        }
      }
    }
  }

  endian satisfies Endian;

  if (rootName === undefined) {
    try {
      return await read<T>(data, { ...options, rootName: true });
    } catch (error) {
      try {
        return await read<T>(data, { ...options, rootName: false });
      } catch {
        throw error;
      }
    }
  }

  rootName satisfies boolean | RootName;

  if (compression !== null) {
    data = await decompress(data, compression);
  }

  if (bedrockLevel === undefined) {
    bedrockLevel = reader.hasBedrockLevelHeader(endian);
  }

  return reader.readRoot<T>({ rootName, endian, compression, bedrockLevel, strict });
}

class NBTReader {
  #byteOffset: number = 0;
  #data: Uint8Array;
  #view: DataView;
  readonly #littleEndian: boolean;
  readonly #varint: boolean;
  readonly #decoder: MUtf8Decoder = new MUtf8Decoder();

  constructor(data: Uint8Array, littleEndian: boolean, varint: boolean) {
    this.#data = data;
    this.#view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    this.#littleEndian = littleEndian;
    this.#varint = varint;
  }

  hasGzipHeader(): boolean {
    const header: number = this.#view.getUint16(0, false);
    return header === 0x1F8B;
  }

  hasZlibHeader(): boolean {
    const header: number = this.#view.getUint8(0);
    return header === 0x78;
  }

  hasBedrockLevelHeader(endian: Endian): boolean {
    if (endian !== "little" || this.#data.byteLength < 8) return false;
    const byteLength: number = this.#view.getUint32(4, true);
    return byteLength === this.#data.byteLength - 8;
  }

  #allocate(byteLength: number): void {
    if (this.#byteOffset + byteLength > this.#data.byteLength) {
      throw new UnexpectedBufferEndError("Ran out of bytes to read, unexpectedly reached the end of the buffer");
    }
  }

  async readRoot<T extends RootTagLike = RootTag>({ rootName, endian, compression, bedrockLevel, strict }: ReadOptions): Promise<NBTData<T>> {
    if (compression !== null) {
      this.#data = await decompress(this.#data, compression);
      this.#view = new DataView(this.#data.buffer);
    }

    if (bedrockLevel) {
      // const version =
        this.#readUnsignedInt();
      this.#readUnsignedInt();
    }

    const type: TAG = this.#readTagType();
    if (type !== TAG.LIST && type !== TAG.COMPOUND) {
      throw new InvalidOpeningTagError(`Expected an opening List or Compound tag at the start of the buffer, encountered tag type '${type}'`);
    }

    const rootNameV: RootName = typeof rootName === "string" || rootName ? this.#readString() : null;
    if (typeof rootName === "string" && rootNameV !== rootName) {
      throw new UnexpectedRootNameError(`Expected root name '${rootName}', encountered '${rootNameV}'`);
    }

    const root: T = this.#readTag<T>(type);

    if (strict && this.#data.byteLength > this.#byteOffset) {
      const remaining: number = this.#data.byteLength - this.#byteOffset;
      throw new UnexpectedEndTagError(`Encountered unexpected End tag at byte offset ${this.#byteOffset}, ${remaining} unread bytes remaining`);
    }

    const result: NBTData<T> = new NBTData<T>(root, { rootName: rootNameV, endian, compression, bedrockLevel });

    if (!strict) {
      result.byteOffset = this.#byteOffset;
    }

    return result;
  }

  #readTag<T extends Tag>(type: TAG): T;
  #readTag<T extends RootTagLike>(type: TAG): T;
  #readTag(type: TAG): Tag {
    switch (type) {
      case TAG.END: {
        const remaining: number = this.#data.byteLength - this.#byteOffset;
        throw new UnexpectedEndTagError(`Encountered unexpected End tag at byte offset ${this.#byteOffset}, ${remaining} unread bytes remaining`);
      }
      case TAG.BYTE: return this.#readByte();
      case TAG.SHORT: return this.#readShort();
      case TAG.INT: return this.#varint ? this.#readVarIntZigZag() : this.#readInt();
      case TAG.LONG: return this.#varint ? this.#readVarLongZigZag() : this.#readLong();
      case TAG.FLOAT: return this.#readFloat();
      case TAG.DOUBLE: return this.#readDouble();
      case TAG.BYTE_ARRAY: return this.#readByteArray();
      case TAG.STRING: return this.#readString();
      case TAG.LIST: return this.#readList();
      case TAG.COMPOUND: return this.#readCompound();
      case TAG.INT_ARRAY: return this.#readIntArray();
      case TAG.LONG_ARRAY: return this.#readLongArray();
      default: throw new InvalidTagError(`Encountered invalid tag type '${type}' at byte offset ${this.#byteOffset}`);
    }
  }

  #readTagType(): TAG {
    const type: number = this.#readUnsignedByte();
    if (!isTagType(type)) {
      throw new InvalidTagError(`Encountered invalid tag type '${type}' at byte offset ${this.#byteOffset}`);
    }
    return type;
  }

  #readUnsignedByte(): number {
    this.#allocate(1);
    const value: number = this.#view.getUint8(this.#byteOffset);
    this.#byteOffset += 1;
    return value;
  }

  #readByte(): number {
    this.#allocate(1);
    const value: number = this.#view.getInt8(this.#byteOffset);
    this.#byteOffset += 1;
    return value;
  }

  #readUnsignedShort(): number {
    this.#allocate(2);
    const value: number = this.#view.getUint16(this.#byteOffset, this.#littleEndian);
    this.#byteOffset += 2;
    return value;
  }

  #readShort(): number {
    this.#allocate(2);
    const value: number = this.#view.getInt16(this.#byteOffset, this.#littleEndian);
    this.#byteOffset += 2;
    return value;
  }

  #readUnsignedInt(): number {
    this.#allocate(4);
    const value: number = this.#view.getUint32(this.#byteOffset, this.#littleEndian);
    this.#byteOffset += 4;
    return value;
  }

  #readInt(): number {
    this.#allocate(4);
    const value: number = this.#view.getInt32(this.#byteOffset, this.#littleEndian);
    this.#byteOffset += 4;
    return value;
  }

  #readVarInt(): number {
    let value: number = 0;
    let shift: number = 0;
    let byte: number;
    while (true) {
      byte = this.#readByte();
      value |= (byte & 0x7F) << shift;
      if ((byte & 0x80) === 0) break;
      shift += 7;
    }
    return value;
  }

  #readVarIntZigZag(): number {
    let result: number = 0;
    let shift: number = 0;
    while (true) {
      this.#allocate(1);
      const byte: number = this.#readByte();
      result |= ((byte & 0x7F) << shift);
      if (!(byte & 0x80)) break;
      shift += 7;
      if (shift > 63) {
        throw new VarNumTooLargeError(`VarInt size '${shift}' at byte offset ${this.#byteOffset} is too large`);
      }
    }
    const zigzag: number = ((((result << 63) >> 63) ^ result) >> 1) ^ (result & (1 << 63));
    return zigzag;
  }

  #readLong(): bigint {
    this.#allocate(8);
    const value: bigint = this.#view.getBigInt64(this.#byteOffset, this.#littleEndian);
    this.#byteOffset += 8;
    return value;
  }

  #readVarLongZigZag(): bigint {
    let result: bigint = 0n;
    let shift: bigint = 0n;
    while (true) {
      this.#allocate(1);
      const byte: number = this.#readByte();
      result |= (BigInt(byte) & 0x7Fn) << shift;
      if (!(byte & 0x80)) break;
      shift += 7n;
      if (shift > 63n) {
        throw new VarNumTooLargeError(`VarLong size '${shift}' at byte offset ${this.#byteOffset} is too large`);
      }
    }
    const zigzag: bigint = (result >> 1n) ^ -(result & 1n);
    return zigzag;
  }

  #readFloat(): number {
    this.#allocate(4);
    const value: number = this.#view.getFloat32(this.#byteOffset, this.#littleEndian);
    this.#byteOffset += 4;
    return value;
  }

  #readDouble(): number {
    this.#allocate(8);
    const value: number = this.#view.getFloat64(this.#byteOffset, this.#littleEndian);
    this.#byteOffset += 8;
    return value;
  }

  #readByteArray(): Int8Array {
    const length: number = this.#varint ? this.#readVarIntZigZag() : this.#readInt();
    this.#allocate(length);
    const value = new Int8Array(this.#data.subarray(this.#byteOffset, this.#byteOffset + length));
    this.#byteOffset += length;
    return value;
  }

  #readString(): string {
    const length: number = this.#varint ? this.#readVarInt() : this.#readUnsignedShort();
    this.#allocate(length);
    const value: string = this.#decoder.decode(this.#data.subarray(this.#byteOffset, this.#byteOffset + length));
    this.#byteOffset += length;
    return value;
  }

  #readList(): Array<Tag> | NumericArray {
    const type: TAG = this.#readTagType();
    const length: number = this.#varint ? this.#readVarIntZigZag() : this.#readInt();
    // lists of numeric types can be represented as typed arrays; if one is found, the class constructor will be stored in appropriateTypedArray
    const appropriateTypedArray = getAppropriateTypedArray(type);
    if(appropriateTypedArray) {
      const value = new appropriateTypedArray(length);
      for (let i: number = 0; i < length; i++) {
        const entry: number | bigint = this.#readTag(type);
        value[i] = entry;
      }
      return value;
    }
    const value: Array<Tag> = [];
    for (let i: number = 0; i < length; i++) {
      const entry: Tag = this.#readTag(type);
      value.push(entry);
    }
    return value;
  }

  #readCompound(): CompoundTag {
    const value: CompoundTag = {};
    while (true) {
      const type: TAG = this.#readTagType();
      if (type === TAG.END) break;
      const name: string = this.#readString();
      const entry: Tag = this.#readTag(type);
      value[name] = entry;
    }
    return value;
  }

  #readIntArray(): Int32Array {
    const length: number = this.#varint ? this.#readVarIntZigZag() : this.#readInt();
    const value = new Int32Array(length);
    for (const i in value) {
      const entry: number = this.#readInt();
      value[i] = entry;
    }
    return value;
  }

  #readLongArray(): BigInt64Array {
    const length: number = this.#varint ? this.#readVarIntZigZag() : this.#readInt();
    const value = new BigInt64Array(length);
    for (const i in value) {
      const entry: bigint = this.#readLong();
      value[i] = entry;
    }
    return value;
  }
}