// Type declarations for ES2024 Disposable pattern
declare global {
  interface SymbolConstructor {
    readonly dispose: unique symbol;
    readonly asyncDispose: unique symbol;
  }
  
  interface Disposable {
    [Symbol.dispose](): void;
  }
  
  interface AsyncDisposable {
    [Symbol.asyncDispose](): PromiseLike<void>;
  }
}

export {};
