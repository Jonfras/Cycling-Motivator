export const haversineDistance = (coords1, coords2) => {
    const toRad = (x) => (x * Math.PI) / 180;

    const lat1 = coords1.lat;
    const lon1 = coords1.lng;
    const lat2 = coords2.lat;
    const lon2 = coords2.lng;

    const R = 6371; // km

    const dLat = toRad(lat2 - lat1);
    const dLatSin = Math.sin(dLat / 2);
    const dLon = toRad(lon2 - lon1);
    const dLonSin = Math.sin(dLon / 2);

    const a =
        dLatSin * dLatSin +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * dLonSin * dLonSin;

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
};

export const fetchRoute = async (start, end) => {
    try {
        const url = `https://router.project-osrm.org/route/v1/bicycling/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
            throw new Error('No route found');
        }

        const route = data.routes[0];
        // data.routes[0].geometry.coordinates is [lng, lat] array
        // We need to convert it to {lat, lng} for Leaflet
        const coordinates = route.geometry.coordinates.map(coord => ({ lat: coord[1], lng: coord[0] }));

        return {
            coordinates,
            distance: route.distance / 1000 // Convert meters to km
        };

    } catch (error) {
        console.error("Routing error:", error);
        return { error: error.message }; // Return error info
    }
};

// Traverse the path based on distance covered
export const getPositionAlongPath = (path, distanceKm) => {
    if (!path || path.length === 0) return null;
    if (distanceKm <= 0) return path[0];

    let covered = 0;

    for (let i = 0; i < path.length - 1; i++) {
        const start = path[i];
        const end = path[i + 1];
        const segDist = haversineDistance(start, end);

        if (covered + segDist >= distanceKm) {
            // Target is in this segment
            const remaining = distanceKm - covered;
            const ratio = remaining / segDist;
            return {
                lat: start.lat + (end.lat - start.lat) * ratio,
                lng: start.lng + (end.lng - start.lng) * ratio
            };
        }

        covered += segDist;
    }

    return path[path.length - 1]; // End of path
};

// Keep old one for fallback
export const interpolatePosition = (start, end, progress) => {
    if (!start || !end) return null;
    if (progress <= 0) return start;
    if (progress >= 1) return end;

    const lat = start.lat + (end.lat - start.lat) * progress;
    const lng = start.lng + (end.lng - start.lng) * progress;
    return { lat, lng };
};
