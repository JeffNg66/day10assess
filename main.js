//load libraries
const express = require('express')
const handlebars = require('express-handlebars')
const fetch = require('node-fetch')
const withQuery = require('with-query').default
const morgan = require('morgan')
// get the driver with promise support
const mysql = require('mysql2/promise')

// SQL 
/* samples
const SQL_FIND_BY_NAME = 'select * from apps where name like ? limit ? offset ?'
const SQL_COUNT_Q = 'select count(*) as q_count from apps where name like ?'
const SQL_GET_TVSHOW_BY_NAME = 'select tvid, name from tv_shows order by name desc limit ?;';
const SQL_GET_TVSHOW_BY_TVID = 'select * from tv_shows where tvid = ?'
*/
const SQL_FIND_TITLE_BY_FIRSTCHAR = 'select book_id, title from book2018 where title like ? limit ? offset ?'
const SQL_COUNT_Q = 'select count(title) as q_count from book2018 where title like ?'
const SQL_GET_BOOK_BY_ID = 'select * from book2018 where book_id = ?'

// configure Login
const PORT = parseInt(process.argv[2]) || parseInt(process.env.PORT) || 3000;
const API_KEY = process.env.API_KEY || 'm6efhDXNXKATcJGGtVf4yCxXBCCZmazj'
const endPoint = 'https://api.nytimes.com/svc/books/v3/reviews.json'

// create the database connection pool
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    database: process.env.DB_NAME || 'goodreads',
    user: process.env.DB_USER || 'goodread',
    password: process.env.DB_PASSWORD || 'goodread',
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 4,
    timezone: '+08:00'
})

const startApp = async (app, pool) => {

    try {
        // acquire a connection from the connection pool
        const conn = await pool.getConnection();

        console.info('Pinging database...')
        await conn.ping()

        // release the connection
        conn.release()

        // start the server
        app.listen(PORT, () => {
            console.info(`Application started on port ${PORT} at ${new Date()}`)
        })

    } catch(e) {
        console.error('Cannot ping database: ', e)
    }
}

// create an instance of application
const app = express()

app.use(morgan('combined'))

// configure handlebars
app.engine('hbs', handlebars({ defaultLayout: 'default.hbs' }))
app.set('view engine', 'hbs')

// configure the application

app.get('/', (req, resp) => {
    resp.status(200)
    resp.type('text/html')
    resp.render('index')
})

app.get('/search', 
    async (req, resp) => {
        const q = req.query['q'];
        const offset = parseInt(req.query['offset']) || 0
        const limit = 10
        let nextOff, recs

        // acquire a connection from the pool
        //let conn, recs, nextOff, queryCount;
        const conn = await pool.getConnection()

        try {
            //conn = await pool.getConnection()
			  // count the number of results
            let result = await conn.query(SQL_COUNT_Q, [ `${q}%` ])
              //console.log('Result SQL Count: ', result)
            let queryCount = result[0][0].q_count
              //console.log('queryCount ', queryCount)

            // perform the query
            //  select * from apps where name like ? limit ?
            result = await conn.query(SQL_FIND_TITLE_BY_FIRSTCHAR, [ `${q}%`, limit, offset ])
            //console.log(result)
            recs = result[0];
            //console.info(recs)

            nextOff = offset + limit
            if (nextOff > queryCount) nextOff = nextOff - limit
            //console.info(queryCount, nextOff)
    
            resp.status(200)
            resp.type('text/html')
            resp.render('booklist', 
                { 
                    result: recs, 
                    hasResult: recs.length > 0,
                    q: q,
                    prevOffset: Math.max(0, offset - limit),
                    nextOffset: nextOff
                }
            ) 
        } catch(e) {
			  resp.status(500)
			  resp.type('text/html')
			  resp.send('<h2>Error</h2>' + e)
        } finally {
            // release connection
            if (conn)
                conn.release()
        }

    }
)

app.get('/show/:bookid', async (req, resp) => {

    const bookid = req.params.bookid
    //console.info(bookid)

	const conn = await pool.getConnection()

	try {
        const [ result, _ ] = await conn.query(SQL_GET_BOOK_BY_ID, [ bookid ])
        //console.log(result)
        const book = result[0]
        //console.info(result[0])

        result[0].genres = book.genres.replace(/\|/g, ', ')
        result[0].authors = book.authors.replace(/\|/g, ', ')
        //console.info(result[0].authors)
        //console.info(result[0].genres)
        const jsonRec = {
            bookId: result[0].book_id,
            title: result[0].title,
            authors: result[0].authors,
            summary: result[0].description,
            pages: result[0].pages,
            rating: result[0].rating,
            ratingCount: result[0].rating_count,
            genre: result[0].genres
        }
        //console.info(jsonRec)

        resp.status(200)
        resp.format({
            'text/html': () => {
                resp.type('text/html')
                resp.render('show', { show: result[0] })
            },
            'application/json': () => {
                resp.type('application/json')
                resp.json(jsonRec)                
            },
            'default': () => {
                resp.type('text/plain')
                resp.send(JSON.stringify(recs))
            }            
        })
	} catch(e) {
		console.error('ERROR: ', e)
		resp.status(500)
		resp.end()
	} finally {
		conn.release()
	}
})

app.get('/api/:title',
    async (req, resp) => {
        //console.info('body: ', req.query.search)
        const searchstr = req.params.title
        //console.info(searchstr)
        
        const url = withQuery(
            endPoint,
            {
                //q: req.query.search,
                title: searchstr,
                //country: req.query.country,
                'api-key': API_KEY

            }
        )
        //console.info(url)

        let result = await fetch(url)

        try {
            const review = await result.json()
            //const news_str = JSON.stringify(news)
            //console.info(review)
            //console.info('news_str ', news_str)

            const review_dis = review.results
                .map(v => {
                    return { 
                        title: v.book_title,
                        author: v.book_author,
                        reviewer: v.byline,
                        reviewDate: v.publication_dt,
                        summary: v.summary,
                        url: v.url  
                    }
                })
                //console.info(news_dis)
                //review_dis.push(review.copyright)

            //console.info(review_dis)           
            resp.status(200)
            resp.type('text/html')
            resp.render('review', {
                searchstr, review_dis,
                hasContent: review.num_results,
                copyright: review.copyright
            })
        } catch(e) {
            console.error('Error ', e)
            return Promise.reject(e)
        } 
    } 
)

app.use((req, resp) => {
	resp.redirect('/')
})


startApp(app, pool) 