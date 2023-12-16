const BingApi = require('./BingApi')
const { createServer } = require('http')
const { Server } = require('socket.io')
const express = require('express')
const app = express()
const server = createServer(app)
const PORT = process.env.PORT || 8080
const cors = require('cors')

// Firebase
require('dotenv').config()
const admin = require('firebase-admin')
const serviceAccount = {
	type: process.env.TYPE,
	project_id: process.env.PROJECT_ID,
	private_key_id: process.env.PRIVATE_KEY_ID,
	private_key: process.env.PRIVATE_KEY.replace(/\\n/g, '\n'),
	client_email: process.env.CLIENT_EMAIL,
	client_id: process.env.CLIENT_ID,
	auth_uri: process.env.AUTH_URI,
	token_uri: process.env.TOKEN_URI,
	auth_provider_x509_cert_url: process.env.AUTH_PROVIDER_X509_CERT_URL,
	client_x509_cert_url: process.env.CLIENT_X509_CERT_URL,
	universe_domain: process.env.UNIVERSE_DOMAIN,
}

admin.initializeApp({
	credential: admin.credential.cert(serviceAccount),
	databaseURL: process.env.REALTIME_DATABASE,
})

const db = admin.database()

// Middlewares
app.use(cors())
app.use(express.json())

// Routes
app.get('/', (req, res) => {
	res.send('Hello World')
})

// SocketIO
const io = new Server(server, {
	cors: {
		origin: ['http://localhost:3000', 'https://super-dalle-3.web.app'],
	},
})

io.on('connection', (socket) => {
	console.log('user joined')

  let allUrls = []

	socket.on('clearImages', async (data) => {
		const { userUid } = data
		const imagesRef = db.ref(`/users/${userUid}/generatedImages`)

		imagesRef.set([])
		allUrls = []
	})

	socket.on('generateImages', async (data) => {
		const { prompt, accounts, isSlowMode, userUid } = data
		const imagesRef = db.ref(`/users/${userUid}/generatedImages`)
		const imagesSnapshot = await imagesRef.once('value')

		allUrls = []
		if (imagesSnapshot.exists()) {
			allUrls = imagesSnapshot.val()
      console.log(`the val is`, allUrls)
		}

		const requests = accounts.map(async (account) => {
			try {
				console.log(`${account.cookie.slice(0, 5)} has started generating`)
				const bingApi = new BingApi(account.cookie)
				const urls = await bingApi.createImages(prompt, isSlowMode)
				allUrls.push(...urls)
				await imagesRef.set(allUrls)
				console.log(`${account.cookie.slice(0, 5)} has generated ${urls.length} images`)
			} catch (error) {
				console.log('error is ', error)
			} finally {
				socket.emit('finishedGeneration', { cookie: account.cookie })
      }
		})

		Promise.all(requests)
			.then(() => {
				console.log('All accounts have finished generating')
			})
			.catch((error) => {
				console.log('error is ', error)
			})
	})
})

// Listen to port
server.listen(PORT, '0.0.0.0', () => {
	console.log(`Server is running on port ${PORT}`)
})
