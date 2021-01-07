import express from 'express'
import cors from 'cors'
import fetch from 'node-fetch'
import cheerio from 'cheerio'
import ical from 'node-ical'
import iconv from 'iconv-lite'

const app = express()
const port = 3001

const responseCache = new Map()

const getGroups = ($) => {
    return $('#rubrikenpanel').next().find('thead tr').map((index, tr) => {
        return {
            id: $(tr).children('th').first().find('div').text().replace(/^Gruppe /, ''),
            icalUrl: 'https://lfuonline.uibk.ac.at/public/' + $(tr).children('th').last().find('a').first().attr('href')
        }
    }).get()
}

const getEvents = async (courseId, group) => {
    const rawEvents = await ical.async.fromURL(group.icalUrl)
    return Object.values(rawEvents).map(e => {
        return {
            title: `Group ${group.id}: ${e.summary}`,
            start: e.start.toISOString(),
            end: e.end.toISOString(),
            groupId: group.id,
            extendedProps: {
                location: e.location,
                comment: e.comment,
                courseId: courseId
            }
        }
    })
}

app.use(cors())

app.get('/courses/:id', async (req, res) => {
    const courseId = req.params.id
    if (responseCache.has(courseId)) {
        res.json(responseCache.get(courseId))
        return
    }

    const coursePageContent = await fetch(`https://lfuonline.uibk.ac.at/public/lfuonline_lv.details?lvnr_id_in=${courseId}`)
        .then((fetchRes) => fetchRes.buffer())
        .then((buffer) => iconv.decode(buffer, 'ISO-8859-1'))

    const $ = cheerio.load(coursePageContent)

    const title = $('h3').text()
    const groups = getGroups($)

    const convertedGroups = await Promise.all(groups.map(async group => {
        const events = await getEvents(courseId, group)
        return {
            groupId: group.id,
            events: events
        }
    }))

    const response = {
        title: title,
        groups: convertedGroups
    }

    responseCache.set(req.params.id, response)

    res.json(response)
})

app.listen(port, () => {
    console.log(`courses-server listening at http://localhost:${port}`)
})
