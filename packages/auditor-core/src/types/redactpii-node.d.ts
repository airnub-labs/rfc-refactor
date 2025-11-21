declare module '@redactpii/node' {
  export function redact(text: string): string;
  export default function (text: string): string;
}
