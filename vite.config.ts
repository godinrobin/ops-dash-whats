import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
// @ts-ignore
import obfuscatorPlugin from "vite-plugin-obfuscator";
import JavaScriptObfuscator from "javascript-obfuscator";
import fs from "fs";

// Configurações de ofuscação de alta segurança
const obfuscatorOptions = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.4,
  debugProtection: true,
  debugProtectionInterval: 2000,
  disableConsoleOutput: true,
  identifierNamesGenerator: 'hexadecimal' as const,
  log: false,
  numbersToExpressions: true,
  renameGlobals: false,
  selfDefending: true,
  simplify: true,
  splitStrings: true,
  splitStringsChunkLength: 5,
  stringArray: true,
  stringArrayCallsTransform: true,
  stringArrayCallsTransformThreshold: 0.75,
  stringArrayEncoding: ['base64'],
  stringArrayIndexShift: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayWrappersCount: 2,
  stringArrayWrappersChainedCalls: true,
  stringArrayWrappersParametersMaxCount: 4,
  stringArrayWrappersType: 'function' as const,
  stringArrayThreshold: 0.75,
  transformObjectKeys: true,
  unicodeEscapeSequence: true,
};

// Plugin customizado para ofuscar arquivos da extensão Chrome após o build
function obfuscateChromeExtension() {
  return {
    name: 'obfuscate-chrome-extension',
    closeBundle: async () => {
      const extensionDir = path.resolve(__dirname, 'dist/chrome-extension');
      const filesToObfuscate = ['content.js', 'background.js', 'popup.js'];
      
      for (const file of filesToObfuscate) {
        const filePath = path.join(extensionDir, file);
        
        try {
          if (fs.existsSync(filePath)) {
            const code = fs.readFileSync(filePath, 'utf-8');
            
            const obfuscatedCode = JavaScriptObfuscator.obfuscate(code, {
              ...obfuscatorOptions,
              target: 'browser',
              sourceMap: false,
            } as any).getObfuscatedCode();
            
            fs.writeFileSync(filePath, obfuscatedCode);
            console.log(`✓ Ofuscado: ${file}`);
          }
        } catch (error) {
          console.error(`✗ Erro ao ofuscar ${file}:`, error);
        }
      }
    }
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === 'development' && componentTagger(),
    // Ofuscação do código React em produção
    mode === 'production' && obfuscatorPlugin({
      include: ["src/**/*.js", "src/**/*.ts", "src/**/*.jsx", "src/**/*.tsx"],
      exclude: [/node_modules/],
      options: obfuscatorOptions,
    }),
    // Ofuscação da extensão Chrome em produção
    mode === 'production' && obfuscateChromeExtension(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Otimizações adicionais de build
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
      mangle: {
        toplevel: true,
      },
    },
    rollupOptions: {
      output: {
        // Nomes de arquivos ofuscados
        entryFileNames: 'assets/[hash].js',
        chunkFileNames: 'assets/[hash].js',
        assetFileNames: 'assets/[hash].[ext]',
      },
    },
  },
}));
