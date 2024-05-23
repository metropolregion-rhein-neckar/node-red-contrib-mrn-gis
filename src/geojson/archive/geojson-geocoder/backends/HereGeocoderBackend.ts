import axios, { AxiosResponse } from 'axios'
import { AbstractGeocoderBackend } from './AbstractGeocoderBackend';

export class HereGeocoderBackend extends AbstractGeocoderBackend {

    constructor(public baseUrl: string, public apiKey: string) {
        super();
    }


    async geocode(geojson_in: any, query_field_name: string): Promise<any> {

        let geojson_out = JSON.parse(JSON.stringify(geojson_in))

        // NOTE: We must recreate the URL object here!
        let urlObj = new URL(this.baseUrl);

        urlObj.searchParams.append("apiKey", this.apiKey)


        for (let feature of geojson_out.features) {

            if (!(query_field_name in feature.properties)) {
                console.log("Skipping feature")
                continue
            }

            let query = feature.properties[query_field_name]
 
            urlObj.searchParams.set("q", query)

            let response = await axios.get(urlObj.toString()).catch((e) => {
                //this.status(new NodeStatus("Error during geocoding request: " + e))
                console.log("Fehlerchen!: " + e);
            }) as AxiosResponse;

            if (response == undefined) {
                //this.status(new NodeStatus("Error during geocoding request. Skipping data row."));
                console.log("Fehlerchen!");
                continue
            }

         
            let items = response.data.items

            if (items.length > 0) {

                let item = items[0]

                let lat = item.position.lat
                let lon = item.position.lng


                let geometry = { "type": "Point", "coordinates": [lon, lat] }

                feature.geometry = geometry
            }

        }


        let result = new Promise((resolve, reject) => {
            resolve(geojson_out)
        })


        return result
    }
}
