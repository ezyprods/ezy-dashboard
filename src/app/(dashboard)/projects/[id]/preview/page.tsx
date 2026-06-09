'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from "@/components/ui/Button";
import { ArrowLeft, Play, Pause, Clock, Music, Heart, MoreHorizontal, Share2 } from "lucide-react";
import { useAudio } from '@/lib/contexts/AudioContext';

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function ProjectPreviewPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const { currentTrack, isPlaying, playTrack, togglePlay } = useAudio();
  
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [audioFiles, setAudioFiles] = useState<any[]>([]);

  useEffect(() => {
    fetchProject();
  }, [projectId]);

  const fetchProject = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      if (!res.ok) throw new Error('Error cargando el proyecto');
      const json = await res.json();
      setData(json);
      
      // Extract all audio files from all folders
      let audios: any[] = [];
      if (json.folders) {
        json.folders.forEach((folder: any) => {
          if (folder.files) {
            folder.files.forEach((file: any) => {
              if (file.mimeType?.startsWith('audio/')) {
                audios.push(file);
              }
            });
          }
        });
      }
      setAudioFiles(audios);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <div className="h-screen flex items-center justify-center bg-[#121212]"><div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" /></div>;
  }

  if (!data) return null;

  const projectTitle = data.project?.name || 'Proyecto Desconocido';
  // If we had an artist name fetched, we'd use it here. 
  // Let's assume project data might have artist metadata later, or we just put 'Artist'.
  const artistName = 'EZY Artist'; 
  const releaseYear = new Date(data.project?.createdTime).getFullYear();
  const totalDurationStr = `${audioFiles.length} canciones`;

  // Determine if this project is currently playing
  const isProjectPlaying = isPlaying && audioFiles.some(f => f.id === currentTrack?.id);

  const handlePlayAll = () => {
    if (isProjectPlaying) {
      togglePlay();
    } else if (audioFiles.length > 0) {
      // Play the first track
      const track = audioFiles[0];
      playTrack({
        id: track.id,
        name: track.name.replace(/\.[^/.]+$/, ''),
        url: `/api/audio/${track.id}`,
        artistName: projectTitle, // Show project as artist or actual artist
      });
    }
  };

  return (
    <div className="min-h-screen bg-[#121212] text-white flex flex-col relative overflow-hidden font-sans pb-32 animate-fade-in">
      
      {/* Dynamic background gradient (Spotify style) */}
      <div className="absolute top-0 left-0 right-0 h-[50vh] bg-gradient-to-b from-[#4a4a4a] to-[#121212] opacity-60 pointer-events-none z-0" />

      {/* Top nav */}
      <div className="relative z-10 px-6 py-4 flex items-center justify-between">
        <button 
          onClick={() => router.back()}
          className="w-8 h-8 rounded-full bg-black/50 flex items-center justify-center hover:scale-105 transition-transform"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
      </div>

      {/* Header section */}
      <div className="relative z-10 px-6 md:px-10 pt-4 pb-6 flex flex-col md:flex-row items-end gap-6">
        <div className="w-48 h-48 md:w-60 md:h-60 shadow-2xl rounded-sm bg-[#282828] flex items-center justify-center shrink-0">
          <Music className="w-20 h-20 text-[#b3b3b3]" />
        </div>
        
        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold uppercase tracking-wider">Álbum</span>
          <h1 className="text-4xl md:text-7xl font-black tracking-tighter text-white mb-2">{projectTitle}</h1>
          
          <div className="flex items-center gap-2 text-sm font-medium">
            <div className="w-6 h-6 rounded-full bg-surface-elevated overflow-hidden border border-[#282828]">
              <img src="/logo.png" alt="Artist" className="w-full h-full object-cover" />
            </div>
            <span className="hover:underline cursor-pointer">{artistName}</span>
            <span className="text-white/70">•</span>
            <span className="text-white/70">{releaseYear}</span>
            <span className="text-white/70">•</span>
            <span className="text-white/70">{totalDurationStr}</span>
          </div>
        </div>
      </div>

      {/* Action bar */}
      <div className="relative z-10 px-6 md:px-10 py-4 flex items-center gap-6 bg-gradient-to-b from-[#121212]/0 to-[#121212]">
        <button 
          onClick={handlePlayAll}
          className="w-14 h-14 rounded-full bg-[#1ed760] text-black flex items-center justify-center hover:scale-105 hover:bg-[#1fdf64] transition-all shadow-xl"
        >
          {isProjectPlaying ? <Pause className="w-7 h-7 fill-current" /> : <Play className="w-7 h-7 fill-current ml-1" />}
        </button>
        <button className="text-[#b3b3b3] hover:text-white transition-colors">
          <Heart className="w-8 h-8" />
        </button>
        <button className="text-[#b3b3b3] hover:text-white transition-colors">
          <MoreHorizontal className="w-8 h-8" />
        </button>
      </div>

      {/* Tracklist */}
      <div className="relative z-10 px-6 md:px-10 mt-6">
        {audioFiles.length === 0 ? (
          <div className="text-[#b3b3b3] text-center py-20">
            No se encontraron pistas de audio en este proyecto.
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#282828] text-[#b3b3b3] text-sm">
                <th className="w-12 pb-2 font-normal text-center">#</th>
                <th className="pb-2 font-normal">Título</th>
                <th className="w-32 pb-2 font-normal hidden md:table-cell">Reproducciones</th>
                <th className="w-16 pb-2 font-normal text-right pr-4"><Clock className="w-4 h-4 inline-block" /></th>
              </tr>
            </thead>
            <tbody>
              {audioFiles.map((file, index) => {
                const displayName = file.name.replace(/\.[^/.]+$/, '');
                const isTrackActive = currentTrack?.id === file.id;
                const isTrackPlaying = isTrackActive && isPlaying;

                const handleRowClick = () => {
                  if (isTrackActive) {
                    togglePlay();
                  } else {
                    playTrack({
                      id: file.id,
                      name: displayName,
                      url: `/api/audio/${file.id}`,
                      artistName: projectTitle,
                    });
                  }
                };

                return (
                  <tr 
                    key={file.id} 
                    onClick={handleRowClick}
                    className="group hover:bg-[#ffffff1a] transition-colors cursor-pointer rounded-md"
                  >
                    <td className="py-3 text-center rounded-l-md">
                      {isTrackPlaying ? (
                        <div className="flex justify-center items-end gap-[2px] h-4">
                          <div className="w-1 h-3 bg-[#1ed760] animate-[bounce_1s_infinite]" />
                          <div className="w-1 h-4 bg-[#1ed760] animate-[bounce_1s_infinite_0.2s]" />
                          <div className="w-1 h-2 bg-[#1ed760] animate-[bounce_1s_infinite_0.4s]" />
                        </div>
                      ) : (
                        <span className={`text-[#b3b3b3] group-hover:hidden ${isTrackActive ? 'text-[#1ed760]' : ''}`}>{index + 1}</span>
                      )}
                      <Play className="w-4 h-4 fill-current text-white hidden group-hover:block mx-auto" />
                    </td>
                    <td className="py-3">
                      <div className={`font-medium text-base ${isTrackActive ? 'text-[#1ed760]' : 'text-white'}`}>
                        {displayName}
                      </div>
                      <div className="text-sm text-[#b3b3b3] group-hover:text-white transition-colors">
                        {artistName}
                      </div>
                    </td>
                    <td className="py-3 text-sm text-[#b3b3b3] hidden md:table-cell">
                      {Math.floor(Math.random() * 50000) + 1000}
                    </td>
                    <td className="py-3 text-sm text-[#b3b3b3] text-right pr-4 rounded-r-md">
                      3:20
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

    </div>
  );
}
