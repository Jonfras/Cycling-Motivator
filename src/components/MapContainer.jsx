import { MapContainer, TileLayer, Marker, Popup, useMapEvents, Polyline } from 'react-leaflet'
import { useState, useEffect } from 'react'
import L from 'leaflet'
import icon from 'leaflet/dist/images/marker-icon.png'
import iconShadow from 'leaflet/dist/images/marker-shadow.png'

import { renderToStaticMarkup } from 'react-dom/server';
import { Flag, Bike } from 'lucide-react';

// Fix for default marker icon in React Leaflet
let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconAnchor: [12, 41],
    popupAnchor: [1, -34]
});

L.Marker.prototype.options.icon = DefaultIcon;

// Custom Icons (Double Size for Accessibility)
const FinishIcon = L.divIcon({
    html: renderToStaticMarkup(
        <div style={{
            color: '#ef4444',
            background: 'white',
            borderRadius: '50%',
            width: '64px',
            height: '64px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 12px -2px rgba(0, 0, 0, 0.5)',
            border: '4px solid #ef4444'
        }}>
            <Flag size={40} fill="#ef4444" />
        </div>
    ),
    className: 'custom-div-icon',
    iconSize: [64, 64],
    iconAnchor: [32, 64],
    popupAnchor: [0, -64]
});

const CyclistIcon = L.divIcon({
    html: renderToStaticMarkup(
        <div style={{
            color: '#22d3ee',
            background: 'var(--bg-surface-solid)',
            borderRadius: '50%',
            width: '80px',
            height: '80px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 30px rgba(34, 211, 238, 0.6)',
            border: '4px solid #22d3ee'
        }}>
            <Bike size={48} />
        </div>
    ),
    className: 'custom-div-icon',
    iconSize: [80, 80],
    iconAnchor: [40, 40],
    popupAnchor: [0, -40]
});

function MapEvents({ onMapClick }) {
    useMapEvents({
        click(e) {
            if (onMapClick) onMapClick(e.latlng);
        },
    });
    return null;
}

const MapContainerComponent = ({ start, end, path, currentPosition, onMapClick, onMarkerClick }) => {
    const [position, setPosition] = useState([48.20967, 13.48831]) // Default: Ried im Innkreis

    return (
        <MapContainer center={position} zoom={13} style={{ height: '100%', width: '100%' }} zoomControl={false}>
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            />
            <MapEvents onMapClick={onMapClick} />
            {start && (
                <Marker
                    position={start}
                    eventHandlers={{ click: () => onMarkerClick && onMarkerClick('start') }}
                >
                    <Popup>Start (Zum Entfernen klicken)</Popup>
                </Marker>
            )}
            {end && (
                <Marker
                    position={end}
                    icon={FinishIcon}
                    eventHandlers={{ click: () => onMarkerClick && onMarkerClick('end') }}
                >
                    <Popup>Ziel (Zum Entfernen klicken)</Popup>
                </Marker>
            )}

            {/* Draw Path */}
            {path && path.length > 0 ? (
                <>
                    <Polyline positions={path} color="#334155" weight={6} opacity={0.5} />
                    <Polyline positions={path} color="#22d3ee" weight={4} />
                </>
            ) : (
                start && end && <Polyline positions={[start, end]} color="#22d3ee" dashArray="10, 10" />
            )}

            {/* Visual enhancement: Cyclist Marker */}
            {currentPosition && (
                <Marker position={currentPosition} icon={CyclistIcon} zIndexOffset={100}>
                    <Popup>Du bist hier!</Popup>
                </Marker>
            )}
        </MapContainer>
    )
}

export default MapContainerComponent
