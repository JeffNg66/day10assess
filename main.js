//load libraries
const express = require('express')
const handlebars = require('express-handlebars')
const fetch = require('node-fetch')
const withQuery = require('with-query').default
// get the driver with promise support
const mysql = require('mysql2/promise')

// SQL 
/* samples
const SQL_FIND_BY_NAME = 'select * from apps where name like ? limit ? offset ?'
const SQL_COUNT_Q = 'select count(*) as q_count from apps where name like ?'
const SQL_GET_TVSHOW_BY_NAME = 'select tvid, name from tv_shows order by name desc limit ?;';
const SQL_GET_TVSHOW_BY_TVID = 'select * from tv_shows where tvid = ?'
*/
const SQL_FIND_TITLE_BY_FIRSTCHAR = 'select title from book2018 where title like ? limit ? offset ?'
const SQL_COUNT_Q = 'select count(title) as q_count from book2018 where title like ?'

// configure Login
const PORT = parseInt(process.argv[2]) || parseInt(process.env.PORT) || 3000;
const API_KEY = process.env.API_KEY || 'm6efhDXNXKATcJGGtVf4yCxXBCCZmazj'
const Secret = process.env.SECRET || 'sZzfXpT9PghIhAJs'
const endPoint = 'https://api.nytimes.com/svc/books/v3'


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

        // acquire a connection from the pool
        let conn, recs;

        try {
            conn = await pool.getConnection()
			  // count the number of results
              let result = await conn.query(SQL_COUNT_Q, [ `${q}%` ])
              //console.log('Result SQL Count: ', result)
              const queryCount = result[0][0].q_count
              //console.log('queryCount ', queryCount)

            // perform the query
            //  select * from apps where name like ? limit ?
            result = await conn.query(SQL_FIND_TITLE_BY_FIRSTCHAR, [ `${q}%`, limit, offset ])
            //console.log(result)
            recs = result[0];

        } catch(e) {
			  resp.status(500)
			  resp.type('text/html')
			  resp.send('<h2>Error</h2>' + e)
        } finally {
            // release connection
            if (conn)
                conn.release()
        }

        resp.status(200)
        resp.type('text/html')
        resp.render('booklist', 
            { 
                result: recs, 
                hasResult: recs.length > 0,
                q: q,
                prevOffset: Math.max(0, offset - limit),
                nextOffset: offset + limit
            }
        ) 
    }
)



startApp(app, pool) 