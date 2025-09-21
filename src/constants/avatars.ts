// src/constants/avatars.ts
export const AVATARS = [
  "/avatars/a01.svg",
  "/avatars/a02.svg",
  "/avatars/a03.svg",
  "/avatars/a04.svg",
  "/avatars/a05.svg",
  "/avatars/a06.svg",
  "/avatars/a07.svg",
  "/avatars/a08.svg",
  "/avatars/a09.svg",
  "/avatars/a10.svg",
  "/avatars/a11.svg",
  "/avatars/a12.svg",
] as const;

function simpleHash(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function avatarIndexFor(identity: string): number {
  return simpleHash(identity) % AVATARS.length; // 0..11
}

export function avatarUrlFor(identity: string): string {
  return AVATARS[avatarIndexFor(identity)];
}
