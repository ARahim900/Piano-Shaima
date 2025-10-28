import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface AlertProps {
  title: string;
  message: string;
  onDismiss: () => void;
}

export const Alert: React.FC<AlertProps> = ({ title, message, onDismiss }) => {
  return (
    <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-md my-4 relative animate-fade-in" role="alert">
      <div className="flex">
        <div className="py-1">
          <AlertTriangle className="h-6 w-6 text-red-500 mr-4" />
        </div>
        <div>
          <p className="font-bold">{title}</p>
          <p className="text-sm">{message}</p>
        </div>
      </div>
      <button
        onClick={onDismiss}
        className="absolute top-0 bottom-0 right-0 px-4 py-3"
        aria-label="Dismiss"
      >
        <X className="h-5 w-5 text-red-500" />
      </button>
    </div>
  );
};
