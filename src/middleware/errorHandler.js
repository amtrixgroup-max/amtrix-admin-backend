const errorHandler = (err, req, res, next) => {
  console.error(err)
  const status = err.status || 500
  const isProd = process.env.NODE_ENV === 'production'
  const message =
    status >= 500 && isProd
      ? 'Internal Server Error'
      : err.message || 'Internal Server Error'
  res.status(status).json({
    success: false,
    error: message,
    status,
  })
}

export default errorHandler
