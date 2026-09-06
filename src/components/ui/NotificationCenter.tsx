/**
 * NotificationCenter — Centre de notifications global
 * 
 * Ce composant fournit un système de notifications avancé avec :
 * - Notifications toast (succès, erreur, info, avertissement)
 * - Centre de notifications persistant
 * - Groupement des notifications par type
 * - Gestion du temps d'affichage
 * - Actions sur les notifications
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Bell, CheckCircle, XCircle, AlertTriangle, Info, X, Clock, Archive, Trash2
} from "lucide-react";

// Types pour les notifications
interface Notification {
  id: string;
  title: string;
  message: string;
  type: "success" | "error" | "info" | "warning";
  timestamp: Date;
  duration?: number; // Temps d'affichage en ms (0 = persistant)
  action?: {
    label: string;
    onClick: () => void;
  };
  dismissible?: boolean;
}

interface NotificationCenterProps {
  position?: "top-right" | "top-left" | "bottom-right" | "bottom-left";
  maxToasts?: number;
  defaultDuration?: number;
  children?: React.ReactNode;
}

// Contexte pour les notifications
export const NotificationContext = React.createContext<{
  addNotification: (notification: Omit<Notification, "id" | "timestamp">) => string;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
  notifications: Notification[];
} | null>(null);

// Couleurs par type de notification
const notificationColors = {
  success: {
    bg: "bg-green-50",
    text: "text-green-700",
    border: "border-green-200",
    icon: <CheckCircle className="w-5 h-5 text-green-600" />,
  },
  error: {
    bg: "bg-red-50",
    text: "text-red-700",
    border: "border-red-200",
    icon: <XCircle className="w-5 h-5 text-red-600" />,
  },
  warning: {
    bg: "bg-yellow-50",
    text: "text-yellow-700",
    border: "border-yellow-200",
    icon: <AlertTriangle className="w-5 h-5 text-yellow-600" />,
  },
  info: {
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-200",
    icon: <Info className="w-5 h-5 text-blue-600" />,
  },
};

// Composant ToastNotification
function ToastNotification({
  notification,
  onDismiss,
  position = "top-right",
}: {
  notification: Notification;
  onDismiss: (id: string) => void;
  position?: NotificationCenterProps["position"];
}) {
  const colors = notificationColors[notification.type];
  const [progress, setProgress] = useState(100);
  
  // Gestion du timer pour l'auto-dismiss
  useEffect(() => {
    if (notification.duration && notification.duration > 0) {
      const timer = setTimeout(() => {
        onDismiss(notification.id);
      }, notification.duration);
      
      // Animation de la barre de progression
      const interval = setInterval(() => {
        setProgress(prev => {
          const newProgress = prev - (100 / (notification.duration / 100));
          return newProgress <= 0 ? 0 : newProgress;
        });
      }, 100);
      
      return () => {
        clearTimeout(timer);
        clearInterval(interval);
      };
    }
  }, [notification, onDismiss]);

  const getPositionClasses = () => {
    switch (position) {
      case "top-left":
        return "top-4 left-4";
      case "bottom-right":
        return "bottom-4 right-4";
      case "bottom-left":
        return "bottom-4 left-4";
      case "top-right":
      default:
        return "top-4 right-4";
    }
  };

  return (
    <motion.div
      layout
      initial={{ 
        opacity: 0, 
        x: position?.includes("right") ? 100 : -100,
        y: position?.includes("top") ? -20 : 20
      }}
      animate={{ 
        opacity: 1, 
        x: 0, 
        y: 0 
      }}
      exit={{ 
        opacity: 0, 
        x: position?.includes("right") ? 100 : -100,
        scale: 0.95
      }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={`
        fixed z-50 bg-surface rounded-xl border border-border shadow-lg p-4
        max-w-xs w-full
        ${getPositionClasses()}
      `}
    >
      <div className="flex items-start gap-3">
        <div className={`
          w-8 h-8 rounded-lg flex items-center justify-center shrink-0
          ${colors.bg}
        `}>
          {colors.icon}
        </div>
        
        <div className="flex-1 min-w-0">
          <h4 className={`
            font-semibold text-sm ${colors.text}
          `}>
            {notification.title}
          </h4>
          <p className="text-sm text-slate-600 mt-0.5">
            {notification.message}
          </p>
          
          {notification.action && (
            <button
              onClick={notification.action.onClick}
              className="mt-2 px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-xs font-medium transition-colors"
            >
              {notification.action.label}
            </button>
          )}
        </div>
        
        {notification.dismissible !== false && (
          <button
            onClick={() => onDismiss(notification.id)}
            className="p-1 rounded-lg hover:bg-slate-100/50 transition-colors text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      
      {/* Barre de progression pour les notifications temporaires */}
      {notification.duration && notification.duration > 0 && (
        <div className="mt-3">
          <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-slate-300"
              initial={{ width: "100%" }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.1 }}
            />
          </div>
        </div>
      )}
    </motion.div>
  );
}

// Composant NotificationPanel (centre de notifications persistant)
function NotificationPanel({
  notifications,
  onDismiss,
  onClearAll,
  onArchiveAll,
}: {
  notifications: Notification[];
  onDismiss: (id: string) => void;
  onClearAll: () => void;
  onArchiveAll: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [hasNew, setHasNew] = useState(false);

  // Détecter les nouvelles notifications
  useEffect(() => {
    const newNotifications = notifications.filter(n => 
      Date.now() - new Date(n.timestamp).getTime() < 30000 // Moins de 30 secondes
    );
    setHasNew(newNotifications.length > 0);
  }, [notifications]);

  // Groupement des notifications par type
  const groupedNotifications = useMemo(() => {
    const groups: Record<string, Notification[]> = {};
    notifications.forEach(n => {
      if (!groups[n.type]) {
        groups[n.type] = [];
      }
      groups[n.type].push(n);
    });
    return groups;
  }, [notifications]);

  // Tri par ordre de priorité : error > warning > info > success
  const sortedTypes = ["error", "warning", "info", "success"];

  return (
    <div className="fixed bottom-6 left-6 z-40">
      <motion.div
        className="bg-surface rounded-xl border border-border shadow-lg p-4 w-80"
        initial={false}
        animate={expanded ? "expanded" : "collapsed"}
        variants={{
          expanded: { height: "auto", width: 320 },
          collapsed: { height: 56, width: 56 },
        }}
        transition={{ duration: 0.2, ease: "easeInOut" }}
      >
        <AnimatePresence mode="wait">
          {expanded ? (
            <motion.div
              key="expanded"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Bell className="w-5 h-5 text-slate-600" />
                  <span className="font-semibold text-slate-800">Notifications</span>
                  {hasNew && (
                    <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                  )}
                </div>
                <button
                  onClick={() => setExpanded(false)}
                  className="p-1 rounded-lg hover:bg-slate-100/50 transition-colors text-slate-400"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              <div className="space-y-4 max-h-80 overflow-y-auto">
                {sortedTypes.map(type => {
                  const typeNotifications = groupedNotifications[type];
                  if (!typeNotifications || typeNotifications.length === 0) return null;
                  
                  const colors = notificationColors[type as keyof typeof notificationColors];
                  
                  return (
                    <div key={type} className="space-y-2">
                      <div className="flex items-center gap-2 mb-2">
                        <div className={`
                          w-6 h-6 rounded-lg flex items-center justify-center
                          ${colors.bg}
                        `}>
                          {colors.icon}
                        </div>
                        <span className="text-sm font-medium text-slate-700">
                          {type.charAt(0).toUpperCase() + type.slice(1)}
                        </span>
                        <span className="text-xs text-slate-500">
                          ({typeNotifications.length})
                        </span>
                      </div>
                      
                      <div className="space-y-2 pl-8">
                        {typeNotifications.map(notification => (
                          <motion.div
                            key={notification.id}
                            layout
                            className={`
                              p-3 rounded-lg border border-border/50
                              ${notification.type === "success" ? "bg-green-50/50" :
                                notification.type === "error" ? "bg-red-50/50" :
                                notification.type === "warning" ? "bg-yellow-50/50" :
                                "bg-blue-50/50"}
                            `}
                            whileHover={{ x: 2 }}
                          >
                            <div className="flex items-start gap-2">
                              <div className="w-1 h-1 rounded-full bg-current mt-2" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-slate-700">
                                    {notification.title}
                                  </span>
                                  <span className="text-xs text-slate-400">
                                    {new Date(notification.timestamp).toLocaleTimeString()}
                                  </span>
                                </div>
                                <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">
                                  {notification.message}
                                </p>
                                
                                {notification.action && (
                                  <button
                                    onClick={notification.action.onClick}
                                    className="mt-2 px-2 py-1 bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 rounded-lg text-xs font-medium transition-colors"
                                  >
                                    {notification.action.label}
                                  </button>
                                )}
                              </div>
                              
                              <button
                                onClick={() => onDismiss(notification.id)}
                                className="p-1 rounded-lg hover:bg-slate-100/50 transition-colors text-slate-400"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              
              <div className="mt-4 pt-4 border-t border-border/50 flex items-center justify-between">
                <div className="flex gap-2">
                  <button
                    onClick={onArchiveAll}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-100/50 rounded-lg transition-colors"
                  >
                    <Archive className="w-3 h-3" />
                    Tout archiver
                  </button>
                  <button
                    onClick={onClearAll}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm text-red-500 hover:text-red-700 hover:bg-red-50/50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                    Tout supprimer
                  </button>
                </div>
                <span className="text-xs text-slate-400">
                  {notifications.length} notifications
                </span>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="collapsed"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2 }}
              className="flex items-center justify-center h-14"
            >
              <button
                onClick={() => setExpanded(true)}
                className="relative"
              >
                <div className={`
                  w-12 h-12 rounded-xl bg-surface border border-border flex items-center justify-center
                  hover:bg-slate-100/50 transition-colors
                `}>
                  <Bell className="w-5 h-5 text-slate-600" />
                </div>
                {hasNew && (
                  <span className="
                    absolute top-1 right-1 w-3 h-3 rounded-full bg-blue-500 
                    border-2 border-white shadow-sm animate-pulse
                  " />
                )}
                {notifications.length > 0 && !hasNew && (
                  <span className="
                    absolute top-1 right-1 w-3 h-3 rounded-full bg-slate-400 
                    border-2 border-white text-xs text-white flex items-center justify-center
                  ">
                    {notifications.length}
                  </span>
                )}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

// Composant principal NotificationCenter
export function NotificationCenter({
  position = "top-right",
  maxToasts = 5,
  defaultDuration = 5000,
  children,
}: NotificationCenterProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const idRef = useRef(0);

  // Ajouter une notification
  const addNotification = useCallback(({
    title,
    message,
    type = "info",
    duration = defaultDuration,
    action,
    dismissible = true,
  }: Omit<Notification, "id" | "timestamp">) => {
    const id = String(++idRef.current);
    const notification: Notification = {
      id,
      title,
      message,
      type,
      timestamp: new Date(),
      duration,
      action,
      dismissible,
    };
    
    setNotifications(prev => {
      // Limiter le nombre de toasts
      const visibleToasts = prev.filter(n => n.duration && n.duration > 0);
      if (visibleToasts.length >= maxToasts) {
        return [notification, ...prev.slice(0, maxToasts - 1)];
      }
      return [notification, ...prev];
    });
    
    return id;
  }, [defaultDuration, maxToasts]);

  // Supprimer une notification
  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  // Supprimer toutes les notifications
  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  // Archiver toutes les notifications (les supprimer du centre mais pas les toasts)
  const archiveAllNotifications = useCallback(() => {
    setNotifications(prev => prev.filter(n => n.duration && n.duration > 0));
  }, []);

  // Séparer les notifications temporaires (toasts) des persistantes
  const toastNotifications = useMemo(() => {
    return notifications.filter(n => n.duration && n.duration > 0);
  }, [notifications]);

  const persistentNotifications = useMemo(() => {
    return notifications.filter(n => !n.duration || n.duration === 0);
  }, [notifications]);

  return (
    <NotificationContext.Provider value={{
      addNotification,
      removeNotification,
      clearNotifications,
      notifications,
    }}>
      {children}
      {/* Notifications Toast */}
      <AnimatePresence>
        {toastNotifications.map(notification => (
          <ToastNotification
            key={notification.id}
            notification={notification}
            onDismiss={removeNotification}
            position={position}
          />
        ))}
      </AnimatePresence>
      
      {/* Centre de notifications persistant */}
      {persistentNotifications.length > 0 && (
        <NotificationPanel
          notifications={persistentNotifications}
          onDismiss={removeNotification}
          onClearAll={clearNotifications}
          onArchiveAll={archiveAllNotifications}
        />
      )}
    </NotificationContext.Provider>
  );
}

// Hook pour utiliser les notifications
export function useNotifications() {
  const context = React.useContext(NotificationContext);
  
  if (!context) {
    throw new Error("useNotifications must be used within a NotificationCenter");
  }
  
  return context;
}

// Fonction utilitaire pour créer des notifications facilement
export function notify({
  title,
  message,
  type = "info",
  duration = 5000,
}: Pick<Notification, "title" | "message" | "type" | "duration">) {
  // Cela sera utilisé via le hook useNotifications
  // dans les composants qui ont accès au contexte
}

export default NotificationCenter;
