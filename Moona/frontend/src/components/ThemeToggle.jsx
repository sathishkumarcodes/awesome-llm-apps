import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from './ui/button';
import { useTheme } from '../contexts/ThemeContext';

const ThemeToggle = ({ className = '' }) => {
  const { theme, toggleTheme } = useTheme();

  return (
    <Button
      onClick={toggleTheme}
      variant="ghost"
      size="sm"
      className={`relative ${className} dark:shadow-[0_0_12px_rgba(250,204,21,0.4)]`}
      aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
    >
      {theme === 'light' ? (
        <Moon className="w-5 h-5 text-gray-700 dark:text-slate-300" />
      ) : (
        <Sun className="w-5 h-5 text-gray-300 dark:text-yellow-400" />
      )}
    </Button>
  );
};

export default ThemeToggle;

