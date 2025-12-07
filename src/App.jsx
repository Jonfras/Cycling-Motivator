import { useState, useEffect } from 'react'
import MapContainerComponent from './components/MapContainer'
import { haversineDistance, interpolatePosition, fetchRoute, getPositionAlongPath } from './utils'
import { Bike, MapPin, Navigation, Trophy, ScanEye, Flag } from 'lucide-react'

import { Users, Plus, Upload, X } from 'lucide-react'

// Default profiles if none exist
const DEFAULT_PROFILES = [
  { id: 'user1', name: 'Fahrer 1', color: '#22d3ee', photo: null },
];

import { supabase } from './supabaseClient'

function App() {
  const [profiles, setProfiles] = useState([]);

  const [showNewProfileForm, setShowNewProfileForm] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [newProfilePhoto, setNewProfilePhoto] = useState(null);

  const [currentUser, setCurrentUser] = useState(null)

  const [appState, setAppState] = useState('SETUP') // SETUP | TRACKING
  const [route, setRoute] = useState({
    start: { lat: 48.20967, lng: 13.48831 }, // Default: Rettenbrunner W. 15, Ried
    end: null,
    path: [],
    distance: 0
  })
  const [progress, setProgress] = useState({ currentKm: 0, totalKm: 0, percentage: 0 })
  const [inputKm, setInputKm] = useState('')
  const [currentPosition, setCurrentPosition] = useState(null)
  const [showCelebration, setShowCelebration] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  // Load profiles from Supabase at start
  useEffect(() => {
    const fetchProfiles = async () => {
      const { data, error } = await supabase.from('profiles').select('*');
      if (error) {
        console.error('Error fetching profiles:', error);
        setProfiles(DEFAULT_PROFILES);
      } else {
        setProfiles(data && data.length > 0 ? data : DEFAULT_PROFILES);
      }
    };
    fetchProfiles();
  }, []);

  const handleCreateProfile = async () => {
    if (!newProfileName.trim()) return;

    const newProfile = {
      id: `user-${Date.now()}`,
      name: newProfileName,
      color: `hsl(${Math.random() * 360}, 70%, 50%)`, // Random color
      photo: newProfilePhoto
    };

    // Optimistic update
    const updatedProfiles = [...profiles, newProfile];
    setProfiles(updatedProfiles);

    // Save to Supabase
    const { error } = await supabase.from('profiles').insert([newProfile]);
    if (error) {
      console.error('Error creating profile:', error);
      // Could revert state here if needed
    }

    setNewProfileName('');
    setNewProfilePhoto(null);
    setShowNewProfileForm(false);
  };

  const handlePhotoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewProfilePhoto(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  // Load user data from Supabase
  useEffect(() => {
    if (!currentUser) return;

    // Reset state locally first
    setRoute({ start: { lat: 48.20967, lng: 13.48831 }, end: null, path: [], distance: 0 });
    setProgress({ currentKm: 0, totalKm: 0, percentage: 0 });
    setAppState('SETUP');

    const loadUserState = async () => {
      const { data, error } = await supabase
        .from('user_state')
        .select('*')
        .eq('user_id', currentUser.id)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 is "Row not found" which is fine for new users
        console.error('Error loading user state:', error);
      }

      if (data) {
        if (data.route) setRoute(data.route);
        if (data.progress) setProgress(data.progress);
        if (data.app_state) setAppState(data.app_state);
      }
    };
    loadUserState();
  }, [currentUser]);

  // Save user data to Supabase (Debounced)
  useEffect(() => {
    if (!currentUser) return;

    const saveData = async () => {
      const { error } = await supabase
        .from('user_state')
        .upsert({
          user_id: currentUser.id,
          route: route,
          progress: progress,
          app_state: appState
        });

      if (error) console.error('Error saving state:', error);
    };

    // Simple debounce/timeout to avoid spamming the DB on every input keystroke/progress update
    const timeoutId = setTimeout(saveData, 1000);
    return () => clearTimeout(timeoutId);

  }, [route, progress, appState, currentUser]);

  useEffect(() => {
    if (appState === 'TRACKING' || appState === 'CELEBRATION') {
      // If we have a real path, use it
      if (route.path && route.path.length > 0) {
        setCurrentPosition(getPositionAlongPath(route.path, progress.currentKm));
      } else if (route.start && route.end) {
        // Fallback
        setCurrentPosition(interpolatePosition(route.start, route.end, progress.percentage));
      }
    } else {
      setCurrentPosition(null);
    }
  }, [progress, route, appState]);

  // Auto-calculate route preview when points are set
  useEffect(() => {
    const calculatePreview = async () => {
      if (appState === 'SETUP' && route.start && route.end) {
        // Prevent re-fetching if we already have the path for these points
        // (A simple check: if path exists, assume it's good for now, or check distance > 0)
        // For simplicity and robustness, we'll fetch if path is empty.
        // But if user moves marker, we need to know. 
        // Current implementation only sets start/end once. To move, they reset.
        // So checking if path is empty is safe for now.
        if (route.path.length === 0 && !isLoading) {
          setIsLoading(true);
          const routeData = await fetchRoute(route.start, route.end);
          setIsLoading(false);

          if (routeData && !routeData.error) {
            setRoute(prev => ({
              ...prev,
              path: routeData.coordinates,
              distance: routeData.distance
            }));
          } else {
            console.warn("Preview routing failed:", routeData?.error);
            // Don't alert here to avoid annoying popups while editing, just log
          }
        }
      }
    };

    calculatePreview();
  }, [route.start, route.end, appState, isLoading]); // removed route.path from dependency to avoid loop if we logic check improperly, though with check it's okay.

  const handleMapClick = (latlng) => {
    if (appState !== 'SETUP') return;

    if (!route.start) {
      setRoute(prev => ({ ...prev, start: latlng }));
    } else if (!route.end) {
      setRoute(prev => ({ ...prev, end: latlng }));
    }
  };

  const handleMarkerClick = (type) => {
    if (appState !== 'SETUP') return;

    setRoute(prev => ({
      ...prev,
      [type]: null,
      path: [], // Clear path if any marker is removed
      distance: 0
    }));
  };

  const resetRoute = () => {
    setRoute({
      start: { lat: 48.20967, lng: 13.48831 }, // Default: Rettenbrunner W. 15, Ried
      end: null,
      path: [],
      distance: 0
    });
    setProgress({ currentKm: 0, totalKm: 0, percentage: 0 });
    setInputKm('');
    setAppState('SETUP');
    setShowCelebration(false);
  };

  const startJourney = async () => {
    if (route.start && route.end) {
      // Use pre-calculated distance if available
      if (route.distance > 0) {
        setProgress({ currentKm: 0, totalKm: route.distance, percentage: 0 });
        setAppState('TRACKING');
      } else {
        // Fallback: Try calculating again or use straight line
        setIsLoading(true);
        const routeData = await fetchRoute(route.start, route.end);
        setIsLoading(false);

        if (routeData && !routeData.error) {
          setRoute(prev => ({ ...prev, path: routeData.coordinates, distance: routeData.distance }));
          setProgress({ currentKm: 0, totalKm: routeData.distance, percentage: 0 });
          setAppState('TRACKING');
        } else {
          // Final Fallback
          const total = haversineDistance(route.start, route.end);
          if (total > 0) {
            alert(`Routenberechnung fehlgeschlagen(${routeData?.error}).Nutze Luftlinie.`);
            setProgress({ currentKm: 0, totalKm: total, percentage: 0 });
            setAppState('TRACKING');
          }
        }
      }
    }
  };

  const addDistance = () => {
    const added = parseFloat(inputKm);
    if (!isNaN(added) && added > 0) {
      setProgress(prev => {
        const newCurrent = Math.min(prev.currentKm + added, prev.totalKm);
        return {
          ...prev,
          currentKm: newCurrent,
          percentage: newCurrent / prev.totalKm,
          totalKm: prev.totalKm // ensure total doesn't get lost
        };
      });
      setInputKm('');
      setAppState('CELEBRATION');
    }
  };

  if (!currentUser) {
    if (showNewProfileForm) {
      return (
        <div style={{ height: '100vh', width: '100vw', background: 'var(--bg-app)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: 'var(--bg-surface)', padding: '40px', borderRadius: 'var(--radius-lg)', border: 'var(--glass-border)', width: '100%', maxWidth: '500px', display: 'flex', flexDirection: 'column', gap: '30px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '2rem', margin: 0 }}>Neuer Fahrer</h2>
              <button onClick={() => setShowNewProfileForm(false)} style={{ background: 'transparent', padding: '10px' }}><X size={32} /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <label style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}>Name</label>
              <input
                type="text"
                value={newProfileName}
                onChange={(e) => setNewProfileName(e.target.value)}
                placeholder="Name eingeben..."
                style={{ padding: '20px', fontSize: '1.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'white' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <label style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}>Foto (Optional)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', padding: '20px', background: 'rgba(255,255,255,0.05)', borderRadius: 'var(--radius-sm)', border: '1px dashed rgba(255,255,255,0.2)', flex: 1, justifyContent: 'center' }}>
                  <Upload size={24} />
                  <span style={{ fontSize: '1.2rem' }}>Bild hochladen</span>
                  <input type="file" accept="image/*" onChange={handlePhotoUpload} style={{ display: 'none' }} />
                </label>
                {newProfilePhoto && (
                  <div style={{ width: '80px', height: '80px', borderRadius: '50%', overflow: 'hidden', border: '2px solid var(--text-secondary)' }}>
                    <img src={newProfilePhoto} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                )}
              </div>
            </div>

            <button className="primary" onClick={handleCreateProfile} style={{ padding: '20px', fontSize: '1.5rem', marginTop: '20px' }} disabled={!newProfileName}>
              Erstellen
            </button>
          </div>
        </div>
      );
    }

    return (
      <div style={{ height: '100vh', width: '100vw', background: 'var(--bg-app)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div style={{ textAlign: 'center', marginBottom: '60px' }}>
          <Bike size={80} className="text-brand" style={{ marginBottom: '20px' }} />
          <h1 style={{ fontSize: '3rem', fontWeight: '800', background: 'var(--brand-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0 }}>
            Wer fährt heute?
          </h1>
          <p style={{ fontSize: '1.5rem', color: 'var(--text-secondary)', marginTop: '10px' }}>Wähle dein Profil</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '30px', width: '100%', maxWidth: '1000px' }}>
          {profiles.map(profile => (
            <button
              key={profile.id}
              onClick={() => setCurrentUser(profile)}
              style={{
                background: 'var(--bg-surface)',
                border: 'var(--glass-border)',
                padding: '40px',
                borderRadius: 'var(--radius-lg)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '20px',
                cursor: 'pointer',
                transition: 'transform 0.2s, box-shadow 0.2s',
                boxShadow: 'var(--shadow-lg)'
              }}
              onMouseOver={e => e.currentTarget.style.transform = 'translateY(-5px)'}
              onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}
            >
              <div style={{
                width: '120px',
                height: '120px',
                borderRadius: '50%',
                background: profile.photo ? 'transparent' : profile.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: `0 0 20px ${profile.color} 60`,
                overflow: 'hidden',
                border: profile.photo ? `3px solid ${profile.color} ` : 'none'
              }}>
                {profile.photo ? (
                  <img src={profile.photo} alt={profile.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <Users size={60} color="#0f172a" />
                )}
              </div>
              <span style={{ fontSize: '1.8rem', fontWeight: 'bold' }}>{profile.name}</span>
            </button>
          ))}

          {/* Add New Profile Button */}
          <button
            onClick={() => setShowNewProfileForm(true)}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '2px dashed rgba(255,255,255,0.2)',
              padding: '40px',
              borderRadius: 'var(--radius-lg)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '20px',
              cursor: 'pointer',
              transition: 'background 0.2s',
              color: 'var(--text-secondary)'
            }}
            onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
            onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
          >
            <div style={{
              width: '120px',
              height: '120px',
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Plus size={50} />
            </div>
            <span style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>Neu</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div style={{ position: 'relative', height: '100vh', width: '100vw' }}>
        <MapContainerComponent
          start={route.start}
          end={route.end}
          path={route.path}
          currentPosition={currentPosition}
          onMapClick={handleMapClick}
          onMarkerClick={handleMarkerClick}
        />

        {/* Header Overlay */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '20px', background: 'linear-gradient(to bottom, rgba(15, 23, 42, 0.9) 0%, transparent 100%)', zIndex: 1000, pointerEvents: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
          <div style={{ pointerEvents: 'auto' }}>
            <h1 style={{ fontSize: '2.5rem', textShadow: '0 2px 4px rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', gap: '16px' }}>
              <Bike className="text-brand" size={48} color="#22d3ee" /> Cycling Motivator
            </h1>
            <p style={{ margin: 0, opacity: 0.8, fontSize: '1.2rem', color: 'var(--text-secondary)' }}>
              {appState === 'SETUP' && !route.start && "Tippe auf die Karte, um den START zu setzen"}
              {appState === 'SETUP' && route.start && !route.end && "Tippe auf die Karte, um das ZIEL zu setzen"}
              {appState === 'SETUP' && route.start && route.end && (isLoading ? "Route wird berechnet..." : `Bereit ? Gesamtstrecke : ${route.distance ? route.distance.toFixed(1) : '...'} km`)}
              {appState === 'TRACKING' && "Bleib dran! Jeder Kilometer zählt."}
            </p>
          </div>

          {/* Actions */}
          <div style={{ pointerEvents: 'auto', display: 'flex', gap: '20px' }}>
            {appState === 'SETUP' && route.end && (
              <button className="primary" onClick={startJourney} disabled={isLoading} style={{ fontSize: '1.2rem', padding: '1em 2em' }}>
                {isLoading ? 'Berechne...' : 'Eintragung starten'}
              </button>
            )}
            {appState === 'SETUP' && route.start && (
              <button onClick={resetRoute} style={{ fontSize: '1.1rem', padding: '1em 2em' }}>
                Zurücksetzen
              </button>
            )}
            {appState === 'TRACKING' && (
              <button onClick={resetRoute} style={{ fontSize: '1rem', padding: '0.8em 1.2em', opacity: 0.7 }}>
                Beenden / Reset
              </button>
            )}
            <button
              onClick={() => setCurrentUser(null)}
              style={{ fontSize: '1rem', padding: '0.8em', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-secondary)' }}
              title="Benutzer wechseln"
            >
              <Users size={24} />
            </button>
          </div>
        </div>

        {/* Tracking Overlay */}
        {appState === 'TRACKING' && (
          <div style={{ position: 'absolute', bottom: 60, left: 20, right: 20, zIndex: 1000, pointerEvents: 'none', display: 'flex', justifyContent: 'center' }}>
            <div style={{ pointerEvents: 'auto', background: 'var(--bg-surface)', backdropFilter: 'blur(12px)', padding: '30px', borderRadius: 'var(--radius-lg)', border: 'var(--glass-border)', width: '100%', maxWidth: '600px', boxShadow: 'var(--shadow-lg)' }}>

              {/* Stats Row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px', alignItems: 'center' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}>Fortschritt</div>
                  <div style={{ fontSize: '2.5rem', fontWeight: 'bold' }}>{Math.round(progress.percentage * 100)}%</div>
                </div>
                {/* Street View Toggle */}
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <button
                    onClick={() => {
                      if (currentPosition) {
                        window.open(`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${currentPosition.lat},${currentPosition.lng}`, '_blank');
                      }
                    }}
                    style={{ padding: '16px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '50%' }}
                    title="Umgebung ansehen (Street View)"
                  >
                    <ScanEye size={40} color="#fff" />
                  </button >
                </div >
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}>Distanz</div>
                  <div style={{ fontSize: '2.5rem', fontWeight: 'bold' }}>{progress.currentKm.toFixed(1)} <span style={{ fontSize: '1.5rem' }}>/ {progress.totalKm.toFixed(1)} km</span></div>
                </div>
              </div >

              {/* Progress Bar */}
              < div style={{ height: '16px', background: 'rgba(255,255,255,0.1)', borderRadius: '8px', marginBottom: '24px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${progress.percentage * 100}%`, background: 'var(--brand-gradient)', transition: 'width 0.5s ease-out' }} />
              </div >

              {/* Input */}
              < div style={{ display: 'flex', gap: '20px' }}>
                <input
                  type="number"
                  placeholder="km hinzufügen..."
                  value={inputKm}
                  onChange={(e) => setInputKm(e.target.value)}
                  style={{ flex: 1, padding: '20px', fontSize: '1.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'white' }}
                />
                <button className="primary" onClick={addDistance} disabled={!inputKm} style={{ padding: '0 40px', fontSize: '1.5rem' }}>
                  Dazu
                </button>
              </div >

            </div >
          </div >
        )}

        {/* Celebration Page (Full Screen) */}
        {appState === 'CELEBRATION' && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 3000, background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', animation: 'fadeIn 0.5s ease' }}>

            {/* Confetti Effect */}
            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', overflow: 'hidden', pointerEvents: 'none' }}>
              <div style={{ position: 'absolute', top: '10%', left: '20%', fontSize: '4rem', animation: 'float 3s ease-in-out infinite' }}>🎉</div>
              <div style={{ position: 'absolute', top: '20%', right: '20%', fontSize: '5rem', animation: 'float 4s ease-in-out infinite reverse' }}>🎊</div>
              <div style={{ position: 'absolute', bottom: '30%', left: '10%', fontSize: '4rem', animation: 'float 5s ease-in-out infinite' }}>✨</div>
              <div style={{ position: 'absolute', top: '15%', right: '10%', fontSize: '3rem', animation: 'float 3.5s ease-in-out infinite reverse' }}>🥳</div>
            </div>

            <div style={{ textAlign: 'center', maxWidth: '800px', padding: '40px', zIndex: 2 }}>
              {/* Conditional Icon */}
              {progress.currentKm >= progress.totalKm ? (
                <Flag size={120} className="text-brand" style={{ marginBottom: '30px', filter: 'drop-shadow(0 0 15px rgba(239, 68, 68, 0.5))', color: '#ef4444' }} />
              ) : (
                <Trophy size={120} className="text-brand" style={{ marginBottom: '30px', filter: 'drop-shadow(0 0 15px rgba(34, 211, 238, 0.5))' }} />
              )}

              <h1 style={{ fontSize: '5rem', margin: '0 0 20px 0', background: 'var(--brand-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontWeight: '800' }}>
                {progress.currentKm >= progress.totalKm ? "ZIEL ERREICHT!" : "Gut gemacht!"}
              </h1>

              <p style={{ fontSize: '2rem', color: 'var(--text-secondary)', marginBottom: '60px' }}>
                {progress.currentKm >= progress.totalKm ? (
                  <>
                    Du hast die gesamte Strecke von <span style={{ color: 'white' }}>{progress.totalKm.toFixed(1)} km</span> gemeistert!<br />
                    Eine fantastische Leistung.
                  </>
                ) : (
                  <>
                    Du kommst deinem Ziel näher. <br />
                    <span style={{ color: 'white' }}>{progress.currentKm.toFixed(1)} km</span> geschafft, <span style={{ color: 'white' }}>{(progress.totalKm - progress.currentKm).toFixed(1)} km</span> verbleibend!
                  </>
                )}
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '30px', width: '100%', maxWidth: '400px', margin: '0 auto' }}>
                <button
                  className="primary"
                  style={{ padding: '30px', fontSize: '1.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', boxShadow: '0 10px 25px -5px rgba(34, 211, 238, 0.5)' }}
                  onClick={() => {
                    if (currentPosition) {
                      window.open(`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${currentPosition.lat},${currentPosition.lng}`, '_blank');
                    }
                  }}
                >
                  <ScanEye size={40} /> Aussicht genießen
                </button>

                {progress.currentKm >= progress.totalKm ? (
                  <button
                    onClick={resetRoute}
                    style={{ padding: '25px', fontSize: '1.5rem', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.5)', borderRadius: 'var(--radius-md)', color: 'white', transition: 'all 0.2s' }}
                  >
                    Neue Route planen
                  </button>
                ) : (
                  <button
                    onClick={() => setAppState('TRACKING')}
                    style={{ padding: '25px', fontSize: '1.5rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', transition: 'all 0.2s' }}
                  >
                    Zurück zur Karte
                  </button>
                )}
              </div>
            </div>

            <div style={{ position: 'absolute', bottom: '40px', color: 'var(--text-secondary)', fontSize: '1.2rem', opacity: 0.5 }}>
              "Es wird nicht leichter, du wirst nur schneller."
            </div>
          </div>
        )}
      </div >
    </>
  )
}

export default App
