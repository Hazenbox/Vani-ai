import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Beaker, Home, TestTube } from 'lucide-react';

export const RouteSwitcher: React.FC = () => {
  const location = useLocation();
  
  const routes = [
    { path: '/', label: 'Current', icon: Home },
    { path: '/gemini', label: 'Semantic', icon: Beaker },
    { path: '/test', label: 'Audio Test', icon: TestTube },
  ];
  
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex gap-2 bg-black/80 backdrop-blur-xl border border-white/10 rounded-full p-1">
      {routes.map(({ path, label, icon: Icon }) => {
        const isActive = location.pathname === path;
        return (
          <Link
            key={path}
            to={path}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium transition-all ${
              isActive
                ? 'bg-white text-black'
                : 'text-white/60 hover:text-white hover:bg-white/10'
            }`}
          >
            <Icon size={14} />
            {label}
          </Link>
        );
      })}
    </div>
  );
};
