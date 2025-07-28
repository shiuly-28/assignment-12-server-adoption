const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const admin = require('firebase-admin');
const app = express();
const port = process.env.PORT || 5000;


dotenv.config();

const stripe = require('stripe')(process.env.PAYMENT_GATEWAY_KEY);
// Middleware
app.use(cors());
app.use(express.json());

const decodedKey = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf8');
const serviceAccount = JSON.parse(decodedKey);




admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@clustersheauly.6uz8dzi.mongodb.net/?retryWrites=true&w=majority&appName=ClusterSheauly`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();

        const usersCollection = client.db("petAdopton").collection("users");
        const petsCollection = client.db("petAdopton").collection("pets");
        const adoptionsCollection = client.db("petAdopton").collection("adoptions");
        // const adoptionsCollection = client.db("petAdopton").collection("adoptionsCollection");
        const donationCollection = client.db("petAdopton").collection("donations");
        const paymentsCollection = client.db("petAdopton").collection("payments");
        const myPetsCollection = client.db("petAdopton").collection("pets");

        // custom middleware for jwt
        const verifyFBToken = async (req, res, next) => {
            console.log('header in the middleware', req.headers);
            const authHeader = req.headers.authorization;
            if (!authHeader) {
                // console.log('authHeader',);
                return res.status(401).send({ message: 'unauthorized access' })
            }
            const token = authHeader.split(' ')[1];
            if (!token) {
                // console.log("token not found");
                return res.status(401).send({ message: 'unauthorized access' })
            }
            // verify the token from server
            try {
                const decoded = await admin.auth().verifyIdToken(token);
                req.decoded = decoded;
                console.log(req);
                next()
            }
            catch (error) {
                return res.status(403).send({ message: 'forbidden access' })
            }
        };


        // API: get all not adopted pets
        app.get("/donations/all", async (req, res) => {
            try {
                const result = await donationCollection.find().toArray();
                res.send(result);
            } catch (error) {
                console.error("Error in /donations/all route:", error);
                res.status(500).json({ message: "Server error" });
            }
        });

        //  route: GET /api/mypets?email=user@example.com
        app.get("/mypets", verifyFBToken, async (req, res) => {
            // console.log("hello", req);
            try {

                const email = req.query.email;
                console.log(email);
                if (!email) {
                    return res.status(400).send({ message: "Email is required" });
                }

                const result = await petsCollection.find({ ownerEmail: email }).toArray();
                res.send(result);
            } catch (error) {
                console.error("Failed to fetch pets", error);
                res.status(500).send({ message: "Failed to load pets" });
            }
        });

        app.delete("/donations/:id", async (req, res) => {
            const id = req.params.id;
            try {
                const result = await donationCollection.deleteOne({ _id: new ObjectId(id) });
                res.send(result);
            } catch (error) {
                console.error("Donation delete failed", error);
                res.status(500).json({ message: "Delete failed" });
            }
        });

        app.get("/api/adoption", verifyFBToken, async (req, res) => {
            const request = await adoptionsCollection.find().toArray();
            res.send(request);
        })


        // POST route: Save adoption form data
        app.post("/api/adoptions", async (req, res) => {
            const adoptions = req.body;

            try {
                const result = await adoptionsCollection.insertOne(adoptions);
                res.status(201).send({
                    message: "Adoption request submitted successfully!",
                    insertedId: result.insertedId,
                });
            } catch (error) {
                console.error("Failed to insert adoption request:", error);
                res.status(500).send({ error: "Failed to submit adoption request" });
            }
        });

        // Reject request
        app.patch("/api/adoption-requests/:id/reject", async (req, res) => {
            const id = req.params.id;
            const result = await adoptionsCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { status: "rejected" } }
            );
            res.send(result);
        });

        app.patch("/api/adoption-requests/:id/accept", async (req, res) => {
            const id = req.params.id;
            const result = await adoptionsCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { status: "accepted" } }
            );
            res.send(result);
        });

        //  Get Donations with Pagination + Sort by Newest First


        app.get("/donations", async (req, res) => {
            // console.log('headers in donation', req.headers);
            try {
                const page = parseInt(req.query.page) || 1;
                const limit = parseInt(req.query.limit) || 6;
                const skip = (page - 1) * limit;
                const sort = req.query.sort === "desc" ? -1 : 1;
                const search = req.query.search || '';

                let query = {};
                if (search) {
                    query = {
                        $or: [
                            { name: { $regex: search, $options: 'i' } },
                            { shortDescription: { $regex: search, $options: 'i' } },
                        ],
                    };
                }

                const total = await donationCollection.countDocuments(query);

                const campaigns = await donationCollection
                    .find(query)
                    .sort({ createdAt: sort }) // latest first
                    .skip(skip)
                    .limit(limit)
                    .toArray();

                const hasMore = total > page * limit;

                res.send({ campaigns, hasMore, page, totalPages: Math.ceil(total / limit) });
            } catch (error) {
                console.error("Error in /donations route:", error);
                res.status(500).json({ message: "Server error" });
            }
        });

        app.get("/donations/:id", async (req, res) => {
            try {
                const id = req.params.id;
                const campaign = await donationCollection.findOne({ _id: new ObjectId(id) });

                if (!campaign) {
                    return res.status(404).json({ message: "Campaign not found" });
                }

                res.send(campaign);
            } catch (error) {
                console.error("❌ Error in /donations/:id route:", error);
                res.status(500).json({ message: "Server error" });
            }
        });

        app.get("/api/donations/:id", async (req, res) => {
            const { id } = req.params;
            try {
                const donation = await donationCollection.findOne({ _id: new ObjectId(id) });
                if (!donation) {
                    return res.status(404).send({ message: "Donation not found" });
                }
                res.send(donation);
            } catch (err) {
                res.status(500).send({ error: "Failed to fetch donation" });
            }
        });


        // POST /donations route
        app.post("/donations", async (req, res) => {
            try {
                const donation = req.body;
                console.log(donation);
                const result = await donationCollection.insertOne({ ...donation, totalDonated: 0 });
                res.send(result); // contains insertedId
            } catch (error) {
                res.status(500).send({ error: "Failed to create donation" });
            }
        });

        app.put('/api/donations/:id', async (req, res) => {
            const { id } = req.params;
            const updatedData = req.body;
            try {
                const result = await donationCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: updatedData }
                );
                res.send(result);
            } catch (err) {
                res.status(500).send({ error: "Update failed" });
            }
        });


        app.patch('/donations/toggle-pause/:id', async (req, res) => {
            const { id } = req.params;

            try {
                const donation = await donationCollection.findOne({ _id: new ObjectId(id) });

                if (!donation) {
                    return res.status(404).send({ error: "Donation not found" });
                }

                const updated = await donationCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { paused: !donation.paused } }
                );

                const status = donation.paused ? "unpaused" : "paused";
                res.send({ message: `Donation ${status} successfully.` });
            } catch (err) {
                console.error("Toggle pause error:", err);
                res.status(500).send({ error: "Internal Server Error" });
            }
        });
        app.get("/donations/donors/:id", async (req, res) => {
            const { id } = req.params;
            const query = { _id: new ObjectId(id) }
            console.log(id);
            try {

                const donors = await donationCollection.findOne(query);
                console.log(donors);
                res.send(donors);
            } catch (err) {
                console.error("Error fetching donors:", err);
                res.status(500).send({ message: "Failed to fetch donors" });
            }

        });
        app.post("/payments", async (req, res) => {
            const payment = req.body;
            const result = await paymentsCollection.insertOne(payment);

            // Update totalDonated in donation campaign
            const updateDoc = {
                $inc: { totalDonated: payment.amount }
            };
            const filter = { _id: new ObjectId(payment.campaignId) };
            const updatedDonation = await donationCollection.updateOne(filter, updateDoc);

            res.send({ result, updatedDonation });
        });
        app.post("/payment/create-payment-intent", async (req, res) => {
            const { amount } = req.body;

            try {
                const paymentIntent = await stripe.paymentIntents.create({
                    amount: amount * 100,
                    currency: "usd",
                    payment_method_types: ["card"],
                });

                res.send({ clientSecret: paymentIntent.client_secret });
            } catch (err) {
                console.error("Stripe Error:", err.message);
                res.status(500).send({ error: "Payment intent creation failed" });
            }
        });

        app.patch("/users/subscribe/:email", async (req, res) => {
            const { email } = req.params;
            try {
                const result = await usersCollection.updateOne(
                    { email },
                    { $set: { subscribed: true } }
                );
                res.send({ success: true, result });
            } catch (error) {
                res.status(500).send({ error: 'Subscription failed' });
            }
        });
        //  Backend route
        app.get('/users/:email/role', async (req, res) => {
            const email = req.params.email;
            console.log(email);
            const user = await usersCollection.findOne({ email });

            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }

            res.json({ role: user.role || 'user' });
        });


        // post: Create a new parcel
        app.post('/users', async (req, res) => {
            const email = req.body.email;
            const existingUser = await usersCollection.findOne({ email });

            if (existingUser) {
                const updateRes = await usersCollection.updateOne(
                    { email },
                    { $set: { last_log_In: new Date().toISOString() } }
                );
                return res.status(200).send({ message: 'User already exists. Last login updated.', inserted: false, updated: true });
            }

            const user = req.body;
            const result = await usersCollection.insertOne(user);
            res.send(result);
        });


        app.get("/pets", async (req, res) => {
            try {
                const page = parseInt(req.query.page) || 1;
                const limit = parseInt(req.query.limit) || 6;
                const skip = (page - 1) * limit;
                const search = req.query.search || '';

                let query = {};
                if (search) {
                    query = {
                        $or: [
                            { name: { $regex: search, $options: 'i' } },
                            { location: { $regex: search, $options: 'i' } },
                        ],
                    };
                }

                const pets = await petsCollection
                    .find(query)
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limit)
                    .toArray();

                const total = await petsCollection.countDocuments(query);

                res.send({
                    pets,
                    total,
                    page,
                    totalPages: Math.ceil(total / limit),
                });
            } catch (err) {
                console.error(err);
                res.status(500).send({ message: "Failed to fetch pets" });
            }
        });

        app.get("/pets/:id", async (req, res) => {
            try {
                const id = req.params.id;
                console.log("Received pet ID:", id);

                if (!ObjectId.isValid(id)) {
                    return res.status(400).send({ message: "Invalid Pet ID format" });
                }

                const pet = await petsCollection
                    .findOne({ _id: new ObjectId(id) });

                if (!pet) {
                    return res.status(404).send({ message: "Pet not found" });
                }

                res.send(pet);
            } catch (err) {
                console.error(err);
                res.status(500).send({ message: "Failed to fetch pet" });
            }
        });

        app.post("/pets", async (req, res) => {
            try {
                const pet = req.body;
                pet.createdAt = new Date().toISOString();
                pet.adopted = false;

                const result = await petsCollection.insertOne(pet);
                res.status(201).send({ message: "Pet added successfully", id: result.insertedId });
            } catch (error) {
                console.error("Failed to add pet:", error);
                res.status(500).send({ message: "Failed to add pet" });
            }
        });

        app.put('/pets/:id', async (req, res) => {
            const id = req.params.id;
            const updatedData = req.body;

            try {
                const result = await petsCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: updatedData }
                );
                res.send(result);
            } catch (error) {
                console.error("Failed to update pet", error);
                res.status(500).send({ message: "Failed to update pet", error: error.message });
            }
        });

        app.delete("/api/pets/:id", async (req, res) => {
            const id = req.params.id;

            if (!ObjectId.isValid(id)) {
                return res.status(400).json({ message: "Invalid pet ID" });
            }

            try {
                const result = await petsCollection.deleteOne({ _id: new ObjectId(id) });

                if (result.deletedCount === 0) {
                    return res.status(404).json({ message: "Pet not found" });
                }

                res.json({ deletedCount: result.deletedCount });
            } catch (err) {
                console.error("Delete error:", err);
                res.status(500).json({ message: "Internal server error" });
            }
        });

        // route: PATCH /api/pets/:id
        app.patch('/api/pets/:id', async (req, res) => {
            const id = req.params.id;
            console.log(id);
            const updateDoc = {
                $set: {
                    adopted: true,
                },
            };

            const result = await myPetsCollection.updateOne(
                { _id: new ObjectId(id) },
                updateDoc, { upsert: true }

            );
            console.log(result);
            res.send(result);
        });
        app.delete("/api/refund/:id", async (req, res) => {
            const { id } = req.params;

            try {
                const result = await paymentsCollection.deleteOne({ _id: new ObjectId(id) });

                if (result.deletedCount === 1) {
                    res.send({ message: "Refund successful" });
                } else {
                    res.status(404).send({ message: "Donation not found" });
                }
            } catch (err) {
                console.error("Refund error:", err);
                res.status(500).send({ message: "Internal Server Error" });
            }
        });

        app.get('/users/admin/:email', async (req, res) => {
            const email = req.params.email;

            try {
                const user = await usersCollection.findOne({ email: email });

                res.send({ isAdmin: user?.role === 'admin' });
            } catch (error) {
                res.status(500).send({ error: 'Internal server error' });
            }
        });

        app.get('/users', async (req, res) => {
            const users = await usersCollection.find().toArray();
            res.send(users);
        });

        app.patch('/users/admin/:id', async (req, res) => {
            const id = req.params.id;
            const user = await usersCollection.findOne({ _id: new ObjectId(id) });
            const newRole = user.role === 'admin' ? 'user' : 'admin';
            const result = await usersCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { role: newRole } }
            );
            res.send(result);
        });

        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


// Test route
app.get("/", (req, res) => {
    res.send("Pet Adoption Server is running!");
});

// start the server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});