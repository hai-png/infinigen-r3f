/**
 * Global Styles for Infinigen R3F UI System
 */

export const globalStyles = `
  /* CSS Variables for theming */
  :root {
    /* Dark theme defaults */
    --panel-bg: #1e1e1e;
    --panel-bg-secondary: #252525;
    --panel-header: #252525;
    --panel-header-hover: #2a2a2a;
    --panel-border: #333333;
    
    --toolbar-bg: #252525;
    --toolbar-border: #333333;
    
    --button-bg: #2a2a2a;
    --button-hover: #3a3a2a;
    --button-disabled: #3a3a3a;
    --button-border: #444444;
    --button-border-hover: #555555;
    
    --input-bg: #2a2a2a;
    --input-border: #444444;
    
    --card-bg: #252525;
    --card-border: #333333;
    --thumbnail-bg: #1a1a1a;
    
    --statusbar-bg: #1a1a1a;
    --statusbar-border: #333333;
    
    --text-primary: #ffffff;
    --text-secondary: #aaaaaa;
    --text-disabled: #666666;
    
    --accent: #4488ff;
    --accent-hover: #5599ff;
    
    --border: #2a2a2a;
    
    --error: #ff4444;
    --warning: #ffaa00;
    --success: #44ff88;
    --info: #4488ff;
    
    --selection-bg: #2a4a6a;
    --hover-bg: #2a2a2a;
    
    --metric-bg: #252525;
    --graph-bg: #1a1a1a;
  }

  /* Reset and base styles */
  .infinigen-ui {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    font-size: 12px;
    line-height: 1.5;
    color: var(--text-primary);
    background-color: var(--panel-bg);
    user-select: none;
  }

  .infinigen-ui * {
    box-sizing: border-box;
  }

  .infinigen-ui button {
    font-family: inherit;
    font-size: inherit;
  }

  .infinigen-ui input,
  .infinigen-ui select {
    font-family: inherit;
    font-size: inherit;
  }

  /* Scrollbar styling */
  .infinigen-ui ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  .infinigen-ui ::-webkit-scrollbar-track {
    background: var(--panel-bg);
  }

  .infinigen-ui ::-webkit-scrollbar-thumb {
    background: var(--button-border);
    border-radius: 4px;
  }

  .infinigen-ui ::-webkit-scrollbar-thumb:hover {
    background: var(--button-border-hover);
  }

  /* Animations */
  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes slideIn {
    from {
      transform: translateY(4px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  @keyframes pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  .infinigen-ui .animate-fade-in {
    animation: fadeIn 0.3s ease;
  }

  .infinigen-ui .animate-slide-in {
    animation: slideIn 0.3s ease;
  }

  .infinigen-ui .animate-pulse {
    animation: pulse 2s infinite;
  }
`;

export default globalStyles;
