const express = require("express")
const router = express.Router()
const multer = require("multer")
const Event = require("../models/eventModel")
const User = require("../models/userModel")

// Setup Web3 and contract
const Web3 = require("web3")
const EsaipTickets = require("../../blockchain/build/contracts/EsaipTickets.json")
const web3 = new Web3("http://127.0.0.1:7545")
let accounts
let addressToMint
let contract

async function get_infos() {
	accounts = await web3.eth.getAccounts()
	addressToMint = accounts[0]

	// Instead of hardcoding the contract address, use the address from the artifact
	const networkId = await web3.eth.net.getId()
	const deployedAddress = EsaipTickets.networks[networkId].address
	contract = new web3.eth.Contract(EsaipTickets.abi, deployedAddress)
}
get_infos()

// Multer setup
const storage = multer.diskStorage({
	destination: function (req, file, cb) {
		cb(null, "./uploads/events")
	},
	filename: function (req, file, cb) {
		cb(null, Date.now() + "-" + file.originalname)
	},
})

const upload = multer({ storage: storage })

router.post("/create", upload.single("image"), async (req, res) => {
	try {
		const { name, date, address, place, city, country, price, tickets: ticketCount } = req.body
		const tickets = {}
		const image = req.file.path
		const total_tickets = ticketCount
		const event = new Event({ name, date, address, place, city, country, price, tickets, total_tickets, image })
		const savedEvent = await event.save()

		for (let i = 0; i < ticketCount; i++) {
			const concertId = savedEvent._id.toString()

			const tokenId = await contract.methods
				.safeMint(addressToMint, concertId)
				.send({ from: addressToMint, gas: 5000000 })
				.then((receipt) => {
					console.log("Ticket successfully minted for user: ", addressToMint, "with concert ID: ", concertId)
					return receipt.events.Transfer.returnValues.tokenId // Get tokenId from event
				})
				.catch((error) => {
					console.error("Error minting ticket for user: ", addressToMint, "with concert ID: ", concertId)
				})

			// Add the ticket ID to the list of tickets for the user
			if (!tickets[addressToMint]) {
				tickets[addressToMint] = []
			}
			tickets[addressToMint].push(String(tokenId))
		}

		// Update the event with the tickets
		savedEvent.tickets = tickets
		await savedEvent.save()

		res.status(201).json({ message: "Event successfully created", success: true })
	} catch (err) {
		console.error(err)
		res.status(500).json({ message: "Server error during event creation", success: false })
	}
})

router.get("/:id", async (req, res) => {
	try {
		const eventId = req.params.id

		// Find the event by ID
		const event = await Event.findById(eventId)
		if (!event) {
			res.status(404).json({ message: "Event not found", success: false })
			return
		}

		// Respond with the event data
		res.status(200).json({ event: event, success: true })
	} catch (err) {
		console.error(err)
		res.status(500).json({ message: "Server error while fetching event", success: false })
	}
})

router.get("/", async (req, res) => {
	try {
		const events = await Event.find()
		if (events.length === 0) {
			res.status(404).json({ message: "No events found", success: false })
			return
		}
		res.status(200).json({ events: events, success: true })
	} catch (err) {
		console.error(err)
		res.status(500).json({ message: "Server error while fetching events", success: false })
	}
})

module.exports = router
