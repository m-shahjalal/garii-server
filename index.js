const express = require('express');
const app = express();
const cors = require('cors');
const admin = require('firebase-admin');
require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');

const PORT = process.env.PORT || 5000;
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
	credential: admin.credential.cert('./firebase-admin.json'),
});

app.use(express.json());
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@cluster0.1gsip.mongodb.net/garii?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
	useNewUrlParser: true,
	useUnifiedTopology: true,
});

const verifyToken = async (req, res, next) => {
	if (req.headers?.authorization?.startsWith('Bearer ')) {
		const token = req.headers.authorization.split(' ')[1];

		try {
			const user = await admin.auth().verifyIdToken(token);
			if (!user) {
				return res
					.status(401)
					.json({ message: 'You are not authorized' });
			} else {
				req.user = user.email;
			}
		} catch {}
	}
	next();
};

async function run() {
	try {
		const connect = await client.connect();
		console.log('db connection established');
		const db = client.db('garii');

		app.get('/products', async (req, res) => {
			const products = await db.collection('products').find({}).toArray();
			res.json(products);
		});

		app.get('/products/:id', async (req, res) => {
			const id = req.params.id;
			const product = await db
				.collection('products')
				.findOne({ _id: ObjectId(id) });
			res.json(product);
		});

		app.delete('/products/:id', verifyToken, async (req, res) => {
			const user = await db
				.collection('users')
				.findOne({ email: req.user });
			if (!user.role === 'admin') {
				return res
					.status(409)
					.json({ message: 'You are not authorized' });
			}
		});

		app.post('/products', verifyToken, async (req, res) => {
			const { title, price, description, image } = req.body;
			const email = req.user;

			const user = await db.collection('users').findOne({ email });
			if (user?.role === 'admin') {
				const product = await db.collection('products').insertOne({
					title,
					price: price,
					description,
					image,
				});
				res.json(product);
			} else {
				res.status(409).json({ message: 'You are not authorized' });
			}
		});

		app.get('/users', async (req, res) => {
			const users = await db.collection('users').find({}).toArray();
			res.json(users);
		});
		app.get('/users/:email', async (req, res) => {
			const { email } = req.params;
			let isAdmin = false;

			const user = await db.collection('users').findOne({ email });
			if (user?.role === 'admin') isAdmin = true;
			res.json({ admin: isAdmin });
		});

		app.post('/users', async (req, res) => {
			const { name, email } = req.body;
			const existing = await db.collection('users').findOne({ email });
			if (existing?.length > 0) {
				return res.json({ message: 'user already exists' });
			} else {
				const users = await db
					.collection('users')
					.insertOne({ name, email });
				res.json(users);
			}
		});

		app.put('/user/admin', verifyToken, async (req, res) => {
			const { email } = req.body;
			if (req.user) {
				const user = await db
					.collection('users')
					.findOne({ email: req.user });

				if (user && user?.role === 'admin') {
					const result = await db
						.collection('users')
						.updateOne(
							{ email: req.body.email },
							{ $set: { role: 'admin' } },
							{ upsert: true }
						);
					console.log(result);
					res.json(result);
				} else {
					res.status(403).json({
						message: 'You are not authorized to to make',
					});
				}
			} else {
				res.status(403).json({ message: 'You are not logged in' });
			}
		});

		app.get('/reviews', async (req, res) => {
			const review = await db.collection('reviews').find({}).toArray();
			res.json(review);
		});

		app.get('/review', verifyToken, async (req, res) => {
			const email = req.user;
			const review = await db
				.collection('reviews')
				.find({ email: email })
				.toArray();
			res.json(review);
		});

		app.post('/reviews', async (req, res) => {
			const review = await db.collection('reviews').insertOne({
				name: req.body.name,
				email: req.body.email,
				text: req.body.text,
				star: req.body.star,
			});
			if (review) {
				const result = await db
					.collection('reviews')
					.findOne({ email: req.body.email });
				res.json(result);
			} else res.join(review);
		});

		app.get('/orders', async (req, res) => {
			const orders = await db.collection('orders').find({}).toArray();
			res.json(orders);
		});
		app.post('/orders', verifyToken, async (req, res) => {
			const { address, totalItems, total, email } = req.body;
			const order = await db
				.collection('orders')
				.insertOne({ address, totalItems, total, email });

			res.json(order);
			console.log(order);
		});
		app.delete('/orders/:id', verifyToken, async (req, res) => {
			const id = req.params.id;
			const item = await db
				.collection('orders')
				.deleteOne({ _id: ObjectId(id) });
			res.json(item);
		});
		app.put('/orders/:id', verifyToken, async (req, res) => {
			const id = req.params.id;
			const user = await db
				.collection('users')
				.findOne({ email: req.user });
			if (!user?.role === 'admin') {
				return res
					.status(409)
					.json({ message: 'You are not authorized' });
			}
			const item = await db
				.collection('orders')
				.updateOne(
					{ _id: ObjectId(id) },
					{ $set: { completed: req.body.completed } },
					{ upsert: true }
				);
			res.json(item);
		});
	} finally {
		// await client.close();
	}
}

run().catch(console.dir);

app.get('/', (req, res) => {
	res.json({ message: 'Hello world!' });
});

app.listen(PORT, () => console.log('Server Running On Port ' + PORT));
