import { NodeStatus, Shape, Fill } from 'node-red-typescript-essentials/node_status'

import axios, { AxiosResponse } from 'axios'




export async function getRequest(node:any, msg:any, url:string){
    
    node.status(new NodeStatus("Start download"))

    let res = await axios.get(url).catch((error) => { 
        node.status(new NodeStatus("Download failed"))
      
        node.error(error, msg)
        
        return

    }) as AxiosResponse

    node.status(new NodeStatus("Download successfull"))

    return res
}