#!/usr/bin/env node

/**
 * Script to add ThemeToggleButton component to a Next.js project
 * 
 * Usage options:
 * 1. Direct execution: npx tsx add-theme-toggle.ts
 * 2. From URL: npx tsx https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/main/add-theme-toggle.ts
 * 3. Global install: npm i -g && add-theme-toggle
 * 
 * This script will:
 * - Check and install dependencies (lucide-react, next-themes)
 * - Install shadcn/ui Button component if missing
 * - Create ThemeProvider component
 * - Create ThemeToggleButton component with View Transitions API support
 * - Update layout.tsx with theme switching logic
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { createInterface } from 'readline';

const PROJECT_ROOT = process.cwd();
const COMPONENTS_DIR = join(PROJECT_ROOT, 'src', 'components');
const UI_DIR = join(COMPONENTS_DIR, 'ui');

// Theme Provider component
const THEME_PROVIDER_COMPONENT = `'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import { type ThemeProviderProps } from 'next-themes/dist/types';

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
`;

// Component code
const THEME_TOGGLE_COMPONENT = `'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';

import { cn } from '@/lib/utils';

type AnimationVariant = 
  | 'circle' 
  | 'circle-blur' 
  | 'gif'
  | 'polygon';

type StartPosition = 
  | 'center' 
  | 'top-left' 
  | 'top-right' 
  | 'bottom-left' 
  | 'bottom-right';

export interface ThemeToggleButtonProps {
  showLabel?: boolean;
  variant?: AnimationVariant;
  start?: StartPosition;
  url?: string; // For gif variant
  className?: string;
}

export const ThemeToggleButton = ({
  showLabel = false,
  variant = 'polygon',
  start = 'center',
  url,
  className,
}: ThemeToggleButtonProps) => {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  const currentTheme = theme === 'dark' ? 'dark' : 'light';
  
  const handleClick = useCallback(() => {
    if (!mounted) return;
    
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    
    // Use View Transitions API if available
    if ('startViewTransition' in document) {
      (document as any).startViewTransition(() => {
        setTheme(newTheme);
      });
    } else {
      setTheme(newTheme);
    }
    // Inject animation styles for this specific transition
    const styleId = \`theme-transition-\${Date.now()}\`;
    const style = document.createElement('style');
    style.id = styleId;
    
    // Generate animation CSS based on variant
    let css = '';
    const positions = {
      center: 'center',
      'top-left': 'top left',
      'top-right': 'top right',
      'bottom-left': 'bottom left',
      'bottom-right': 'bottom right',
    };
    
    if (variant === 'circle') {
      const cx = start === 'center' ? '50' : start.includes('left') ? '0' : '100';
      const cy = start === 'center' ? '50' : start.includes('top') ? '0' : '100';
      css = \`
        @supports (view-transition-name: root) {
          ::view-transition-old(root) { 
            animation: none;
          }
          ::view-transition-new(root) {
            animation: circle-expand 0.4s ease-out;
            transform-origin: \${positions[start]};
          }
          @keyframes circle-expand {
            from {
              clip-path: circle(0% at \${cx}% \${cy}%);
            }
            to {
              clip-path: circle(150% at \${cx}% \${cy}%);
            }
          }
        }
      \`;
    } else if (variant === 'circle-blur') {
      const cx = start === 'center' ? '50' : start.includes('left') ? '0' : '100';
      const cy = start === 'center' ? '50' : start.includes('top') ? '0' : '100';
      css = \`
        @supports (view-transition-name: root) {
          ::view-transition-old(root) { 
            animation: none;
          }
          ::view-transition-new(root) {
            animation: circle-blur-expand 0.5s ease-out;
            transform-origin: \${positions[start]};
            filter: blur(0);
          }
          @keyframes circle-blur-expand {
            from {
              clip-path: circle(0% at \${cx}% \${cy}%);
              filter: blur(4px);
            }
            to {
              clip-path: circle(150% at \${cx}% \${cy}%);
              filter: blur(0);
            }
          }
        }
      \`;
    } else if (variant === 'gif' && url) {
      css = \`
        @supports (view-transition-name: root) {
          ::view-transition-old(root) {
            animation: fade-out 0.4s ease-out;
          }
          ::view-transition-new(root) {
            animation: gif-reveal 2.5s cubic-bezier(0.4, 0, 0.2, 1);
            mask-image: url('\${url}');
            mask-size: 0%;
            mask-repeat: no-repeat;
            mask-position: center;
          }
          @keyframes fade-out {
            to {
              opacity: 0;
            }
          }
          @keyframes gif-reveal {
            0% {
              mask-size: 0%;
            }
            20% {
              mask-size: 35%;
            }
            60% {
              mask-size: 35%;
            }
            100% {
              mask-size: 300%;
            }
          }
        }
      \`;
    } else if (variant === 'polygon') {
      css = \`
        @supports (view-transition-name: root) {
          ::view-transition-old(root) {
            animation: none;
          }
          ::view-transition-new(root) {
            animation: \${currentTheme === 'light' ? 'wipe-in-dark' : 'wipe-in-light'} 0.4s ease-out;
          }
          @keyframes wipe-in-dark {
            from {
              clip-path: polygon(0 0, 0 0, 0 100%, 0 100%);
            }
            to {
              clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%);
            }
          }
          @keyframes wipe-in-light {
            from {
              clip-path: polygon(100% 0, 100% 0, 100% 100%, 100% 100%);
            }
            to {
              clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%);
            }
          }
        }
      \`;
    }
    
    if (css) {
      style.textContent = css;
      document.head.appendChild(style);
      
      // Clean up animation styles after transition
      setTimeout(() => {
        const styleEl = document.getElementById(styleId);
        if (styleEl) {
          styleEl.remove();
        }
      }, 3000);
    }
    
  }, [mounted, currentTheme, setTheme, variant, start, url]);
  
  if (!mounted) {
    return (
      <Button
        variant="outline"
        size={showLabel ? 'default' : 'icon'}
        className={cn(
          'relative overflow-hidden transition-all',
          showLabel && 'gap-2',
          className
        )}
        aria-label="Toggle theme"
        disabled
      >
        <Sun className="h-[1.2rem] w-[1.2rem]" />
        {showLabel && <span className="text-sm">Theme</span>}
      </Button>
    );
  }
  
  return (
    <Button
      variant="outline"
      size={showLabel ? 'default' : 'icon'}
      onClick={handleClick}
      className={cn(
        'relative overflow-hidden transition-all',
        showLabel && 'gap-2',
        className
      )}
      aria-label={\`Switch to \${currentTheme === 'light' ? 'dark' : 'light'} theme\`}
    >
      {currentTheme === 'light' ? (
        <Sun className="h-[1.2rem] w-[1.2rem]" />
      ) : (
        <Moon className="h-[1.2rem] w-[1.2rem]" />
      )}
      {showLabel && (
        <span className="text-sm">
          {currentTheme === 'light' ? 'Light' : 'Dark'}
        </span>
      )}
    </Button>
  );
};

// Export a helper hook for using with View Transitions API
export const useThemeTransition = () => {
  const startTransition = useCallback((updateFn: () => void) => {
    if ('startViewTransition' in document) {
      (document as any).startViewTransition(updateFn);
    } else {
      updateFn();
    }
  }, []);
  return { startTransition };
};
`;

function checkDependencies() {
  console.log('📦 Checking dependencies...');
  
  const packageJsonPath = join(PROJECT_ROOT, 'package.json');
  if (!existsSync(packageJsonPath)) {
    throw new Error('package.json not found. Are you in a Node.js project?');
  }

  const packageJson = JSON.parse(
    readFileSync(packageJsonPath, 'utf-8')
  );
  
  const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
  const missing: string[] = [];

  if (!deps['lucide-react']) {
    missing.push('lucide-react');
  }

  if (!deps['next-themes']) {
    missing.push('next-themes');
  }

  if (missing.length > 0) {
    console.log(`⚠️  Missing dependencies: ${missing.join(', ')}`);
    console.log('Installing missing dependencies...');
    const packageManager = existsSync(join(PROJECT_ROOT, 'pnpm-lock.yaml')) 
      ? 'pnpm' 
      : existsSync(join(PROJECT_ROOT, 'yarn.lock'))
      ? 'yarn'
      : 'npm';
    
    execSync(`${packageManager} add ${missing.join(' ')}`, { 
      stdio: 'inherit',
      cwd: PROJECT_ROOT 
    });
    console.log('✅ Dependencies installed');
  } else {
    console.log('✅ All dependencies are installed');
  }
}

function ensureButtonComponent() {
  console.log('🔘 Checking for Button component...');
  
  const buttonPath = join(UI_DIR, 'button.tsx');
  
  if (existsSync(buttonPath)) {
    console.log('✅ Button component already exists');
    return;
  }

  console.log('⚠️  Button component not found. Installing via shadcn/ui...');
  
  // Check if shadcn CLI is available
  try {
    execSync('pnpx shadcn@canary add button --yes', {
      stdio: 'inherit',
      cwd: PROJECT_ROOT,
    });
    console.log('✅ Button component installed');
  } catch (error) {
    console.error('❌ Failed to install button component via shadcn/ui');
    console.error('Please install it manually: pnpx shadcn@canary add button');
    throw error;
  }
}

function createThemeToggleComponent() {
  console.log('🎨 Creating ThemeToggleButton component...');
  
  // Ensure directories exist
  if (!existsSync(COMPONENTS_DIR)) {
    mkdirSync(COMPONENTS_DIR, { recursive: true });
  }
  if (!existsSync(UI_DIR)) {
    mkdirSync(UI_DIR, { recursive: true });
  }

  const componentPath = join(UI_DIR, 'theme-toggle-button.tsx');
  
  if (existsSync(componentPath)) {
    console.log('⚠️  ThemeToggleButton component already exists');
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    
    return new Promise<void>((resolve) => {
      rl.question('Overwrite? (y/N): ', (answer: string) => {
        if (answer.toLowerCase() !== 'y') {
          console.log('❌ Skipped');
          rl.close();
          resolve();
          return;
        }
        writeFileSync(componentPath, THEME_TOGGLE_COMPONENT, 'utf-8');
        console.log(`✅ ThemeToggleButton component created at ${componentPath}`);
        rl.close();
        resolve();
      });
    });
  }

  writeFileSync(componentPath, THEME_TOGGLE_COMPONENT, 'utf-8');
  console.log(`✅ ThemeToggleButton component created at ${componentPath}`);
}

function createThemeProvider() {
  console.log('🎨 Creating ThemeProvider component...');
  
  // Ensure directories exist
  if (!existsSync(COMPONENTS_DIR)) {
    mkdirSync(COMPONENTS_DIR, { recursive: true });
  }

  const providerPath = join(COMPONENTS_DIR, 'theme-provider.tsx');
  
  if (existsSync(providerPath)) {
    console.log('✅ ThemeProvider already exists');
    return;
  }

  writeFileSync(providerPath, THEME_PROVIDER_COMPONENT, 'utf-8');
  console.log(`✅ ThemeProvider component created at ${providerPath}`);
}

function updateLayout() {
  console.log('📝 Updating layout.tsx...');
  
  const layoutPath = join(PROJECT_ROOT, 'src', 'app', 'layout.tsx');
  
  if (!existsSync(layoutPath)) {
    console.log('⚠️  layout.tsx not found, skipping layout update');
    return;
  }

  let layoutContent = readFileSync(layoutPath, 'utf-8');
  let needsUpdate = false;
  
  // Add ThemeProvider import if not present
  if (!layoutContent.includes('ThemeProvider')) {
    const themeProviderImport = "import { ThemeProvider } from '@/components/theme-provider';";
    
    // Find the last import statement and add after it
    const importRegex = /(import\s+.*?from\s+['"].*?['"];?\s*\n)/g;
    const imports = layoutContent.match(importRegex);
    
    if (imports && imports.length > 0) {
      const lastImport = imports[imports.length - 1];
      const lastImportIndex = layoutContent.lastIndexOf(lastImport);
      const insertIndex = lastImportIndex + lastImport.length;
      layoutContent = 
        layoutContent.slice(0, insertIndex) + 
        themeProviderImport + '\n' + 
        layoutContent.slice(insertIndex);
    } else {
      layoutContent = themeProviderImport + '\n' + layoutContent;
    }
    needsUpdate = true;
  }

  // Add ThemeToggleButton import if not present
  if (!layoutContent.includes('ThemeToggleButton')) {
    const importStatement = "import { ThemeToggleButton } from '@/components/ui/theme-toggle-button';";
    
    // Find the last import statement and add after it
    const importRegex = /(import\s+.*?from\s+['"].*?['"];?\s*\n)/g;
    const imports = layoutContent.match(importRegex);
    
    if (imports && imports.length > 0) {
      const lastImport = imports[imports.length - 1];
      const lastImportIndex = layoutContent.lastIndexOf(lastImport);
      const insertIndex = lastImportIndex + lastImport.length;
      layoutContent = 
        layoutContent.slice(0, insertIndex) + 
        importStatement + '\n' + 
        layoutContent.slice(insertIndex);
    } else {
      layoutContent = importStatement + '\n' + layoutContent;
    }
    needsUpdate = true;
  }

  // Add suppressHydrationWarning to html tag if not present
  if (!layoutContent.includes('suppressHydrationWarning')) {
    layoutContent = layoutContent.replace(
      /<html([^>]*)>/,
      '<html$1 suppressHydrationWarning>'
    );
    needsUpdate = true;
  }

  // Wrap body content with ThemeProvider if not already wrapped
  if (!layoutContent.includes('<ThemeProvider')) {
    const bodyTagRegex = /(<body[\s\S]*?>)([\s\S]*?)(<\/body>)/;
    const bodyMatch = layoutContent.match(bodyTagRegex);
    
    if (bodyMatch) {
      const bodyOpening = bodyMatch[1];
      let bodyContent = bodyMatch[2].trim();
      const bodyClosing = bodyMatch[3];
      
      // Wrap with ThemeProvider
      const newBodyContent = `\n        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          ${bodyContent}
        </ThemeProvider>\n      `;
      
      layoutContent = layoutContent.replace(
        bodyTagRegex,
        `${bodyOpening}${newBodyContent}${bodyClosing}`
      );
      needsUpdate = true;
    }
  }

  // Add button if not present
  if (!layoutContent.includes('ThemeToggleButton')) {
    // Find the ThemeProvider closing tag and add button before it
    const themeProviderRegex = /(<ThemeProvider[\s\S]*?>)([\s\S]*?)(<\/ThemeProvider>)/;
    const providerMatch = layoutContent.match(themeProviderRegex);
    
    if (providerMatch) {
      const providerOpening = providerMatch[1];
      let providerContent = providerMatch[2].trim();
      const providerClosing = providerMatch[3];
      
      // Check if button already exists in content
      if (!providerContent.includes('ThemeToggleButton')) {
        // Add button wrapper at the beginning
        const buttonWrapper = `<div className="relative">
          <div className="fixed top-4 right-4 z-50">
            <ThemeToggleButton />
          </div>
          ${providerContent}
        </div>`;
        
        layoutContent = layoutContent.replace(
          themeProviderRegex,
          `${providerOpening}\n        ${buttonWrapper}\n      ${providerClosing}`
        );
        needsUpdate = true;
      }
    } else {
      // Fallback: add button to body if ThemeProvider pattern not found
      const bodyTagRegex = /(<body[\s\S]*?>)([\s\S]*?)(<\/body>)/;
      const bodyMatch = layoutContent.match(bodyTagRegex);
      
      if (bodyMatch) {
        const bodyOpening = bodyMatch[1];
        let bodyContent = bodyMatch[2].trim();
        const bodyClosing = bodyMatch[3];
        
        if (!bodyContent.includes('ThemeToggleButton')) {
          const newBodyContent = `\n        <div className="relative">
          <div className="fixed top-4 right-4 z-50">
            <ThemeToggleButton />
          </div>
          ${bodyContent}
        </div>\n      `;
          
          layoutContent = layoutContent.replace(
            bodyTagRegex,
            `${bodyOpening}${newBodyContent}${bodyClosing}`
          );
          needsUpdate = true;
        }
      }
    }
  }

  if (needsUpdate) {
    writeFileSync(layoutPath, layoutContent, 'utf-8');
    console.log(`✅ Updated layout.tsx with theme switching logic`);
  } else {
    console.log('✅ Layout already has theme switching setup');
  }
}

async function main() {
  try {
    console.log('🚀 Adding ThemeToggleButton component to your project...\n');
    
    checkDependencies();
    console.log('');
    
    ensureButtonComponent();
    console.log('');
    
    await createThemeToggleComponent();
    console.log('');
    
    createThemeProvider();
    console.log('');
    
    updateLayout();
    console.log('');
    
    console.log('✨ Done! Theme switching has been set up in your project.');
    console.log('   - ThemeProvider created at: src/components/theme-provider.tsx');
    console.log('   - ThemeToggleButton created at: src/components/ui/theme-toggle-button.tsx');
    console.log('   - Layout updated with theme provider and toggle button');
    console.log('');
    console.log('💡 The theme toggle button is now functional with View Transitions API support!');
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
