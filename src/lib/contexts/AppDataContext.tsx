'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { 
  Artist, 
  CreateArtistInput, 
  PersonalProject, 
  CreatePersonalProjectInput, 
  Payment
} from '@/types';

// Types for additional resources
export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdTime: string;
  modifiedTime: string;
  webViewLink?: string;
  webContentLink?: string;
  url?: string;
  parents?: string[];
  expiresAt?: number | null;
}

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: string;
  end: string;
  htmlLink: string;
}

export interface DashboardPulseData {
  artists: Artist[];
  globalStats: any;
}

interface AppDataContextType {
  // Artists
  artists: Artist[];
  activeArtists: Artist[];
  archivedArtists: Artist[];
  artistsLoading: boolean;
  artistsError: string | null;
  fetchArtists: (force?: boolean) => Promise<Artist[]>;
  createArtist: (data: CreateArtistInput) => Promise<{ success: boolean; artist?: Artist; error?: string }>;
  updateArtist: (id: string, data: Partial<CreateArtistInput>) => Promise<{ success: boolean; artist?: Artist; error?: string }>;
  deleteArtistFromState: (id: string) => void;

  // Personal Projects
  personalProjects: PersonalProject[];
  personalProjectsLoading: boolean;
  personalProjectsError: string | null;
  fetchPersonalProjects: (force?: boolean) => Promise<PersonalProject[]>;
  createPersonalProject: (input: CreatePersonalProjectInput) => Promise<PersonalProject>;
  updatePersonalProject: (id: string, updates: Partial<PersonalProject>) => Promise<PersonalProject>;
  replacePersonalProjectAudio: (id: string, file: File) => Promise<PersonalProject>;
  deletePersonalProject: (id: string) => Promise<void>;
  clonePersonalProjectToArtist: (id: string, artistId: string, customTitle?: string, projectType?: string) => Promise<any>;

  // Matrices
  matrices: any[];
  completedMatrices: any[];
  matricesLoading: boolean;
  matricesError: string | null;
  fetchMatrices: (force?: boolean) => Promise<{ matrices: any[]; completedMatrices: any[] }>;
  setMatrices: React.Dispatch<React.SetStateAction<any[]>>;
  setCompletedMatrices: React.Dispatch<React.SetStateAction<any[]>>;

  // Payments
  payments: Payment[];
  paymentsLoading: boolean;
  paymentsError: string | null;
  fetchPayments: (force?: boolean) => Promise<Payment[]>;
  createPayment: (data: Partial<Payment>) => Promise<{ success: boolean; payment?: Payment; error?: string }>;
  updatePaymentStatus: (id: string, status: Payment['status']) => Promise<{ success: boolean; error?: string }>;

  // Recent Files
  recentFiles: DriveFile[];
  recentFilesLoading: boolean;
  fetchRecentFiles: (force?: boolean) => Promise<DriveFile[]>;

  // Calendar
  calendarEvents: CalendarEvent[];
  calendarLoading: boolean;
  calendarError: string | null;
  fetchCalendar: (force?: boolean) => Promise<CalendarEvent[]>;

  // Dashboard Pulse
  pulseData: DashboardPulseData;
  pulseLoading: boolean;
  fetchPulse: (force?: boolean) => Promise<DashboardPulseData>;

  // Global Refresh / Warmup
  prefetchAll: (force?: boolean) => void;
  isInitialWarmed: boolean;
}

const AppDataContext = createContext<AppDataContextType | null>(null);

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  // In-flight promises map to deduplicate concurrent network calls
  const inFlightRef = useRef<{ [key: string]: Promise<any> | undefined }>({});

  // 1. Artists State
  const [artists, setArtists] = useState<Artist[]>([]);
  const [artistsLoading, setArtistsLoading] = useState(true);
  const [artistsError, setArtistsError] = useState<string | null>(null);
  const artistsLoadedRef = useRef(false);

  // 2. Dashboard Pulse State
  const [pulseData, setPulseData] = useState<DashboardPulseData>({ artists: [], globalStats: null });
  const [pulseLoading, setPulseLoading] = useState(true);
  const pulseLoadedRef = useRef(false);

  // 3. Matrices State
  const [matrices, setMatrices] = useState<any[]>([]);
  const [completedMatrices, setCompletedMatrices] = useState<any[]>([]);
  const [matricesLoading, setMatricesLoading] = useState(true);
  const [matricesError, setMatricesError] = useState<string | null>(null);
  const matricesLoadedRef = useRef(false);

  // 4. Personal Projects State
  const [personalProjects, setPersonalProjects] = useState<PersonalProject[]>([]);
  const [personalProjectsLoading, setPersonalProjectsLoading] = useState(true);
  const [personalProjectsError, setPersonalProjectsError] = useState<string | null>(null);
  const personalProjectsLoadedRef = useRef(false);

  // 5. Payments State
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(true);
  const [paymentsError, setPaymentsError] = useState<string | null>(null);
  const paymentsLoadedRef = useRef(false);

  // 6. Recent Files State
  const [recentFiles, setRecentFiles] = useState<DriveFile[]>([]);
  const [recentFilesLoading, setRecentFilesLoading] = useState(true);
  const recentFilesLoadedRef = useRef(false);

  // 7. Calendar State
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const calendarLoadedRef = useRef(false);

  const [isInitialWarmed, setIsInitialWarmed] = useState(false);

  // ==========================================
  // FETCHERS (With in-flight deduplication)
  // ==========================================

  // --- Fetch Artists ---
  const fetchArtists = useCallback(async (force = false): Promise<Artist[]> => {
    if (!force && artistsLoadedRef.current) {
      return artists;
    }
    if (inFlightRef.current['artists']) {
      return inFlightRef.current['artists'];
    }

    setArtistsLoading(true);
    const promise = (async () => {
      try {
        const res = await fetch('/api/artists');
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to fetch artists');
        }
        const data = await res.json();
        if (data.needsAuth) {
          throw new Error('Token de Google necesita actualización.');
        }
        const list: Artist[] = data.artists || [];
        setArtists(list);
        artistsLoadedRef.current = true;
        setArtistsError(null);
        return list;
      } catch (err: any) {
        console.error('Error fetching artists:', err);
        setArtistsError(err.message);
        return [];
      } finally {
        setArtistsLoading(false);
        delete inFlightRef.current['artists'];
      }
    })();

    inFlightRef.current['artists'] = promise;
    return promise;
  }, [artists]);

  // --- Fetch Pulse ---
  const fetchPulse = useCallback(async (force = false): Promise<DashboardPulseData> => {
    if (!force && pulseLoadedRef.current) {
      return pulseData;
    }
    if (inFlightRef.current['pulse']) {
      return inFlightRef.current['pulse'];
    }

    setPulseLoading(true);
    const promise = (async () => {
      try {
        const res = await fetch('/api/dashboard/pulse');
        if (!res.ok) throw new Error('Failed to fetch dashboard pulse');
        const data = await res.json();
        if (!data.needsAuth) {
          setPulseData(data);
          pulseLoadedRef.current = true;
          // If artists are returned in pulse, we can also seed artists if not loaded
          if (data.artists && !artistsLoadedRef.current) {
            setArtists(data.artists);
          }
        }
        return data;
      } catch (err: any) {
        console.error('Failed to load dashboard pulse', err);
        return { artists: [], globalStats: null };
      } finally {
        setPulseLoading(false);
        delete inFlightRef.current['pulse'];
      }
    })();

    inFlightRef.current['pulse'] = promise;
    return promise;
  }, [pulseData]);

  // --- Fetch Matrices ---
  const fetchMatrices = useCallback(async (force = false): Promise<{ matrices: any[]; completedMatrices: any[] }> => {
    if (!force && matricesLoadedRef.current) {
      return { matrices, completedMatrices };
    }
    if (inFlightRef.current['matrices']) {
      return inFlightRef.current['matrices'];
    }

    setMatricesLoading(true);
    const promise = (async () => {
      try {
        const res = await fetch('/api/dashboard/matrices');
        if (!res.ok) throw new Error('Failed to fetch matrices');
        const data = await res.json();
        const actives = data.matrices || [];
        const completeds = data.completedMatrices || [];
        setMatrices(actives);
        setCompletedMatrices(completeds);
        matricesLoadedRef.current = true;
        setMatricesError(null);
        return { matrices: actives, completedMatrices: completeds };
      } catch (err: any) {
        console.error('Error fetching matrices:', err);
        setMatricesError(err.message);
        return { matrices: [], completedMatrices: [] };
      } finally {
        setMatricesLoading(false);
        delete inFlightRef.current['matrices'];
      }
    })();

    inFlightRef.current['matrices'] = promise;
    return promise;
  }, [matrices, completedMatrices]);

  // --- Fetch Personal Projects ---
  const fetchPersonalProjects = useCallback(async (force = false): Promise<PersonalProject[]> => {
    if (!force && personalProjectsLoadedRef.current) {
      return personalProjects;
    }
    if (inFlightRef.current['personalProjects']) {
      return inFlightRef.current['personalProjects'];
    }

    setPersonalProjectsLoading(true);
    const promise = (async () => {
      try {
        const res = await fetch('/api/personal-projects');
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Error al cargar los proyectos personales');
        }
        const data = await res.json();
        const list: PersonalProject[] = data.projects || [];
        setPersonalProjects(list);
        personalProjectsLoadedRef.current = true;
        setPersonalProjectsError(null);
        return list;
      } catch (err: any) {
        console.error('usePersonalProjects error:', err);
        setPersonalProjectsError(err.message || 'Error de conexión');
        return [];
      } finally {
        setPersonalProjectsLoading(false);
        delete inFlightRef.current['personalProjects'];
      }
    })();

    inFlightRef.current['personalProjects'] = promise;
    return promise;
  }, [personalProjects]);

  // --- Fetch Payments ---
  const fetchPayments = useCallback(async (force = false): Promise<Payment[]> => {
    if (!force && paymentsLoadedRef.current) {
      return payments;
    }
    if (inFlightRef.current['payments']) {
      return inFlightRef.current['payments'];
    }

    setPaymentsLoading(true);
    const promise = (async () => {
      try {
        const res = await fetch('/api/payments');
        if (!res.ok) throw new Error('Failed to fetch payments');
        const data = await res.json();
        const list: Payment[] = data.payments || [];
        setPayments(list);
        paymentsLoadedRef.current = true;
        setPaymentsError(null);
        return list;
      } catch (err: any) {
        console.error('Error fetching payments:', err);
        setPaymentsError(err.message);
        return [];
      } finally {
        setPaymentsLoading(false);
        delete inFlightRef.current['payments'];
      }
    })();

    inFlightRef.current['payments'] = promise;
    return promise;
  }, [payments]);

  // --- Fetch Recent Files ---
  const fetchRecentFiles = useCallback(async (force = false): Promise<DriveFile[]> => {
    if (!force && recentFilesLoadedRef.current) {
      return recentFiles;
    }
    if (inFlightRef.current['recentFiles']) {
      return inFlightRef.current['recentFiles'];
    }

    setRecentFilesLoading(true);
    const promise = (async () => {
      try {
        const res = await fetch('/api/dashboard/recent-files');
        if (!res.ok) throw new Error('Failed to load recent files');
        const data = await res.json();
        const list: DriveFile[] = data.files || [];
        setRecentFiles(list);
        recentFilesLoadedRef.current = true;
        return list;
      } catch (err: any) {
        console.error('Failed to load recent files', err);
        return [];
      } finally {
        setRecentFilesLoading(false);
        delete inFlightRef.current['recentFiles'];
      }
    })();

    inFlightRef.current['recentFiles'] = promise;
    return promise;
  }, [recentFiles]);

  // --- Fetch Calendar ---
  const fetchCalendar = useCallback(async (force = false): Promise<CalendarEvent[]> => {
    if (!force && calendarLoadedRef.current) {
      return calendarEvents;
    }
    if (inFlightRef.current['calendar']) {
      return inFlightRef.current['calendar'];
    }

    setCalendarLoading(true);
    const promise = (async () => {
      try {
        const res = await fetch('/api/calendar?days=60');
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to fetch calendar');
        }
        const list: CalendarEvent[] = data.events || [];
        setCalendarEvents(list);
        calendarLoadedRef.current = true;
        setCalendarError(null);
        return list;
      } catch (err: any) {
        console.error('Error fetching calendar:', err);
        setCalendarError(err.message);
        return [];
      } finally {
        setCalendarLoading(false);
        delete inFlightRef.current['calendar'];
      }
    })();

    inFlightRef.current['calendar'] = promise;
    return promise;
  }, [calendarEvents]);

  // ==========================================
  // PREFETCH ALL ON APP MOUNT (WARMUP)
  // ==========================================
  const prefetchAll = useCallback((force = false) => {
    // Launch all fetches in parallel
    Promise.allSettled([
      fetchPulse(force),
      fetchArtists(force),
      fetchMatrices(force),
      fetchPersonalProjects(force),
      fetchPayments(force),
      fetchRecentFiles(force),
      fetchCalendar(force),
    ]).then(() => {
      setIsInitialWarmed(true);
    });
  }, [fetchPulse, fetchArtists, fetchMatrices, fetchPersonalProjects, fetchPayments, fetchRecentFiles, fetchCalendar]);

  useEffect(() => {
    prefetchAll(false);
  }, [prefetchAll]);

  // Listen to recentfiles:refresh event (dispatched e.g. after upload)
  useEffect(() => {
    const handleRefreshRecent = () => {
      fetchRecentFiles(true);
    };
    window.addEventListener('recentfiles:refresh', handleRefreshRecent);
    return () => window.removeEventListener('recentfiles:refresh', handleRefreshRecent);
  }, [fetchRecentFiles]);

  // ==========================================
  // MUTATIONS (Optimistic Updates)
  // ==========================================

  // --- Artist Mutations ---
  const createArtist = useCallback(async (data: CreateArtistInput) => {
    try {
      const res = await fetch('/api/artists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to create artist');
      }

      const newArtist: Artist = await res.json();
      setArtists(prev => [newArtist, ...prev]);
      // Also update pulse state if available
      setPulseData(prev => ({
        ...prev,
        artists: [newArtist, ...prev.artists]
      }));
      return { success: true, artist: newArtist };
    } catch (err: any) {
      console.error('Error creating artist:', err);
      return { success: false, error: err.message };
    }
  }, []);

  const updateArtist = useCallback(async (id: string, data: Partial<CreateArtistInput>) => {
    try {
      const res = await fetch(`/api/artists/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to update artist');
      }

      const { artist: updatedArtist } = await res.json();
      setArtists(prev => prev.map(a => a.id === id ? updatedArtist : a));
      setPulseData(prev => ({
        ...prev,
        artists: prev.artists.map(a => a.id === id ? updatedArtist : a)
      }));
      return { success: true, artist: updatedArtist };
    } catch (err: any) {
      console.error('Error updating artist:', err);
      return { success: false, error: err.message };
    }
  }, []);

  const deleteArtistFromState = useCallback((id: string) => {
    setArtists(prev => prev.filter(a => a.id !== id));
    setPulseData(prev => ({
      ...prev,
      artists: prev.artists.filter(a => a.id !== id)
    }));
  }, []);

  // --- Personal Project Mutations ---
  const createPersonalProject = useCallback(async (input: CreatePersonalProjectInput): Promise<PersonalProject> => {
    const res = await fetch('/api/personal-projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Error al crear el proyecto personal');
    }

    const data = await res.json();
    const newProj: PersonalProject = data.project;
    setPersonalProjects(prev => [newProj, ...prev.filter(p => p.id !== newProj.id)]);
    return newProj;
  }, []);

  const updatePersonalProject = useCallback(async (id: string, updates: Partial<PersonalProject>): Promise<PersonalProject> => {
    const res = await fetch(`/api/personal-projects/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Error al actualizar el proyecto');
    }

    const data = await res.json();
    const updatedProj: PersonalProject = data.project;
    setPersonalProjects(prev => prev.map(p => (p.id === id ? updatedProj : p)));
    return updatedProj;
  }, []);

  const replacePersonalProjectAudio = useCallback(async (id: string, file: File): Promise<PersonalProject> => {
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch(`/api/personal-projects/${id}/replace-audio`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Error al sustituir el archivo de audio');
    }

    const data = await res.json();
    const updatedProj: PersonalProject = data.project;
    setPersonalProjects(prev => prev.map(p => (p.id === id ? updatedProj : p)));
    return updatedProj;
  }, []);

  const deletePersonalProject = useCallback(async (id: string): Promise<void> => {
    const res = await fetch(`/api/personal-projects/${id}`, {
      method: 'DELETE',
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Error al eliminar el proyecto');
    }

    setPersonalProjects(prev => prev.filter(p => p.id !== id));
  }, []);

  const clonePersonalProjectToArtist = useCallback(async (
    id: string, 
    artistId: string, 
    customTitle?: string, 
    projectType: string = 'single'
  ) => {
    const res = await fetch(`/api/personal-projects/${id}/clone-to-artist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artistId, projectTitle: customTitle, projectType }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Error al ceder el proyecto al artista');
    }

    const data = await res.json();
    if (data.project) {
      setPersonalProjects(prev => prev.map(p => (p.id === id ? data.project : p)));
    }
    // Also re-sync artists/matrices if needed
    fetchArtists(true);
    return data;
  }, [fetchArtists]);

  // --- Payment Mutations ---
  const createPayment = useCallback(async (data: Partial<Payment>) => {
    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to create payment');
      const newPayment = await res.json();
      setPayments(prev => [newPayment.payment, ...prev]);
      return { success: true, payment: newPayment.payment };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }, []);

  const updatePaymentStatus = useCallback(async (id: string, status: Payment['status']) => {
    try {
      const res = await fetch('/api/payments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) throw new Error('Failed to update payment');
      const updated = await res.json();
      setPayments(prev => prev.map(p => p.id === id ? updated.payment : p));
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }, []);

  // Filtered artists lists
  const activeArtists = useMemo(() => artists.filter(a => a.status !== 'archived'), [artists]);
  const archivedArtists = useMemo(() => artists.filter(a => a.status === 'archived'), [artists]);

  const value = useMemo<AppDataContextType>(() => ({
    // Artists
    artists,
    activeArtists,
    archivedArtists,
    artistsLoading,
    artistsError,
    fetchArtists,
    createArtist,
    updateArtist,
    deleteArtistFromState,

    // Personal Projects
    personalProjects,
    personalProjectsLoading,
    personalProjectsError,
    fetchPersonalProjects,
    createPersonalProject,
    updatePersonalProject,
    replacePersonalProjectAudio,
    deletePersonalProject,
    clonePersonalProjectToArtist,

    // Matrices
    matrices,
    completedMatrices,
    matricesLoading,
    matricesError,
    fetchMatrices,
    setMatrices,
    setCompletedMatrices,

    // Payments
    payments,
    paymentsLoading,
    paymentsError,
    fetchPayments,
    createPayment,
    updatePaymentStatus,

    // Recent Files
    recentFiles,
    recentFilesLoading,
    fetchRecentFiles,

    // Calendar
    calendarEvents,
    calendarLoading,
    calendarError,
    fetchCalendar,

    // Pulse
    pulseData,
    pulseLoading,
    fetchPulse,

    // Global
    prefetchAll,
    isInitialWarmed,
  }), [
    artists,
    activeArtists,
    archivedArtists,
    artistsLoading,
    artistsError,
    fetchArtists,
    createArtist,
    updateArtist,
    deleteArtistFromState,
    personalProjects,
    personalProjectsLoading,
    personalProjectsError,
    fetchPersonalProjects,
    createPersonalProject,
    updatePersonalProject,
    deletePersonalProject,
    clonePersonalProjectToArtist,
    matrices,
    completedMatrices,
    matricesLoading,
    matricesError,
    fetchMatrices,
    payments,
    paymentsLoading,
    paymentsError,
    fetchPayments,
    createPayment,
    updatePaymentStatus,
    recentFiles,
    recentFilesLoading,
    fetchRecentFiles,
    calendarEvents,
    calendarLoading,
    calendarError,
    fetchCalendar,
    pulseData,
    pulseLoading,
    fetchPulse,
    prefetchAll,
    isInitialWarmed,
  ]);

  return (
    <AppDataContext.Provider value={value}>
      {children}
    </AppDataContext.Provider>
  );
}

export function useAppData() {
  const context = useContext(AppDataContext);
  if (!context) {
    throw new Error('useAppData must be used within an AppDataProvider');
  }
  return context;
}
