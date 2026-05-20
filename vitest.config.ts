import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

const config = {
  test: {
    environment: 'node',
    globals: false,
    exclude: ['node_modules', 'e2e'],
  },
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(dirname, './src') },
      { find: /^react$/, replacement: path.resolve(dirname, './src/test/shims/react.ts') },
      { find: /^react\/jsx-runtime$/, replacement: path.resolve(dirname, './src/test/shims/react-jsx-runtime.ts') },
      { find: /^react-dom\/server$/, replacement: path.resolve(dirname, './src/test/shims/react-dom-server.ts') },
      { find: /^next\/server$/, replacement: path.resolve(dirname, './src/test/shims/next-server.ts') },
      { find: /^next\/link$/, replacement: path.resolve(dirname, './src/test/shims/next-link.ts') },
      { find: /^next\/navigation$/, replacement: path.resolve(dirname, './src/test/shims/next-navigation.ts') },
      { find: /^@google-analytics\/admin$/, replacement: path.resolve(dirname, './src/test/shims/google-analytics-admin.ts') },
      { find: /^@google-analytics\/data$/, replacement: path.resolve(dirname, './src/test/shims/google-analytics-data.ts') },
      { find: /^@googleapis\/searchconsole$/, replacement: path.resolve(dirname, './src/test/shims/googleapis-searchconsole.ts') },
      { find: /^google-auth-library$/, replacement: path.resolve(dirname, './src/test/shims/google-auth-library.ts') },
      { find: /^recharts$/, replacement: path.resolve(dirname, './src/test/shims/recharts.ts') },
    ],
  },
};

export default config;
