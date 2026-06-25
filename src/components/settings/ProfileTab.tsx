'use client';

import { useState, useEffect } from 'react';
import { User, Building, Mail, Phone, Globe, Save, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export function ProfileTab() {
  const [formData, setFormData] = useState({
    studioName: '',
    email: '',
    phone: '',
    website: ''
  });
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    // Load from localStorage
    const saved = localStorage.getItem('ezy_studio_profile');
    if (saved) {
      try {
        setFormData(JSON.parse(saved));
      } catch (e) {
        console.error('Error parsing studio profile:', e);
      }
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setIsSaved(false);
  };

  const handleSave = () => {
    localStorage.setItem('ezy_studio_profile', JSON.stringify(formData));
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h2 className="text-xl font-semibold text-text-primary mb-2 flex items-center gap-2">
          <User className="w-5 h-5 text-accent" />
          Perfil del Estudio
        </h2>
        <p className="text-text-secondary text-sm mb-6">
          Información pública de tu estudio. Estos datos se utilizarán para personalizar los portales de artistas y generar firmas o facturas automáticamente en el futuro.
        </p>

        <div className="glass p-6 sm:p-8 rounded-2xl border border-border">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            
            <div className="space-y-1.5 group">
              <label className="text-xs font-bold text-text-secondary uppercase tracking-wider pl-1 transition-colors group-focus-within:text-accent">
                Nombre del Estudio
              </label>
              <div className="relative flex items-center bg-surface border border-border rounded-xl transition-all duration-300 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20 overflow-hidden shadow-sm hover:shadow-md">
                <div className="pl-4 pr-3 py-3 text-text-secondary group-focus-within:text-accent transition-colors">
                  <Building className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  name="studioName"
                  value={formData.studioName}
                  onChange={handleChange}
                  placeholder="Ej. EZY Productions"
                  className="w-full bg-transparent py-3 pr-4 text-sm font-medium text-text-primary placeholder:text-text-secondary/50 outline-none"
                />
              </div>
            </div>

            <div className="space-y-1.5 group">
              <label className="text-xs font-bold text-text-secondary uppercase tracking-wider pl-1 transition-colors group-focus-within:text-accent">
                Correo Oficial
              </label>
              <div className="relative flex items-center bg-surface border border-border rounded-xl transition-all duration-300 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20 overflow-hidden shadow-sm hover:shadow-md">
                <div className="pl-4 pr-3 py-3 text-text-secondary group-focus-within:text-accent transition-colors">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="estudio@ejemplo.com"
                  className="w-full bg-transparent py-3 pr-4 text-sm font-medium text-text-primary placeholder:text-text-secondary/50 outline-none"
                />
              </div>
            </div>

            <div className="space-y-1.5 group">
              <label className="text-xs font-bold text-text-secondary uppercase tracking-wider pl-1 transition-colors group-focus-within:text-accent">
                Teléfono / WhatsApp
              </label>
              <div className="relative flex items-center bg-surface border border-border rounded-xl transition-all duration-300 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20 overflow-hidden shadow-sm hover:shadow-md">
                <div className="pl-4 pr-3 py-3 text-text-secondary group-focus-within:text-accent transition-colors">
                  <Phone className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="+34 600 000 000"
                  className="w-full bg-transparent py-3 pr-4 text-sm font-medium text-text-primary placeholder:text-text-secondary/50 outline-none"
                />
              </div>
            </div>

            <div className="space-y-1.5 group">
              <label className="text-xs font-bold text-text-secondary uppercase tracking-wider pl-1 transition-colors group-focus-within:text-accent">
                Sitio Web
              </label>
              <div className="relative flex items-center bg-surface border border-border rounded-xl transition-all duration-300 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20 overflow-hidden shadow-sm hover:shadow-md">
                <div className="pl-4 pr-3 py-3 text-text-secondary group-focus-within:text-accent transition-colors">
                  <Globe className="w-4 h-4" />
                </div>
                <input
                  type="url"
                  name="website"
                  value={formData.website}
                  onChange={handleChange}
                  placeholder="https://tu-sitio.com"
                  className="w-full bg-transparent py-3 pr-4 text-sm font-medium text-text-primary placeholder:text-text-secondary/50 outline-none"
                />
              </div>
            </div>

          </div>

          <div className="mt-8 flex justify-end">
            <Button 
              onClick={handleSave} 
              className={`min-w-[150px] transition-all ${isSaved ? 'bg-success hover:bg-success text-white' : ''}`}
            >
              {isSaved ? (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2" /> Guardado
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" /> Guardar Cambios
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
