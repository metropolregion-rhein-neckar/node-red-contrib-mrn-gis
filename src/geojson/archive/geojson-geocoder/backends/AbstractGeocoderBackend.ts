export abstract class AbstractGeocoderBackend {
    
    abstract geocode(geojson : any, query : string) : any
}