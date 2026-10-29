# E-Commerce Delivery and Logistics Performance

A no-build, browser-based delivery analytics dashboard for exploring order reliability, delivery speed, cancellations, and customer ratings. It works with imported CSV data and includes a synthetic demo dataset for previewing the interface.

## Highlights

- Light and night themes, with the preference saved in the browser.
- Import CSV files locally; order data is processed in the browser and not uploaded.
- Filter by reporting period, region, and carrier; export a Markdown report.
- Review KPI definitions, date coverage, small-sample warnings, and investigation prompts alongside the results.

## Publish with GitHub

This project has no build step or runtime dependencies. The static dashboard files can be published with GitHub Pages. Keep private customer/order exports out of version control; `data/private/` is ignored by `.gitignore`.

The current workspace is inside a broader user-profile Git repository. For a dedicated project repository, put this project folder in its own repository location before running Git commands. From the project folder in that standalone location:

```sh
git init
git add .
git commit -m "Build delivery performance dashboard"
git branch -M main
git remote add origin https://github.com/YOUR-USER/YOUR-REPOSITORY.git
git push -u origin main
```

For GitHub Pages, choose the `main` branch and `/ (root)` as the publishing source in the repository's Pages settings.

## Run the dashboard

Requires Node.js 18 or newer. From this folder, run:

```sh
npm start
```

Open `http://127.0.0.1:5173`. Run the KPI tests with `npm test`.

The initial view uses generated synthetic orders to demonstrate the report. These values are not operational findings. Import an order-level CSV to replace them.

## CSV input

The only required fields are a promised delivery date and an actual delivery date. The importer recognizes common header variants such as `promised_date`, `expected_delivery_date`, `actual_date`, and `delivered_at`. ISO 8601 dates are recommended; blank or invalid dates are excluded from date-based metrics.

Optional fields improve the breakdowns and context:

| Field             | Example header        | Used for                                             |
| ----------------- | --------------------- | ---------------------------------------------------- |
| Order ID          | `order_id`            | Duplicate detection; later duplicate IDs are skipped |
| Order date        | `order_date`          | Reporting period filter                              |
| Dispatch date     | `dispatch_date`       | Dispatch-to-delivery duration                        |
| Order status      | `status`              | Delivered and cancelled classification               |
| Cancellation flag | `cancellation_status` | Cancellation classification                          |
| Region            | `region`              | Geographic comparison                                |
| Carrier           | `carrier`             | Carrier comparison and scorecard                     |
| Rating            | `customer_rating`     | Average rating for delivered orders                  |
| Product category  | `product_category`    | Preserved for future analysis                        |
| Distance band     | `distance_band`       | Preserved for future analysis                        |

Use one row per order. Keep cancellation flags or statuses populated where available. To calculate delivery duration, include both dispatch and actual delivery timestamps. Imported records stay in the browser and are not uploaded to a service.

## KPI definitions

- On-time delivery: delivered orders with valid promised and actual dates delivered on or before the promise, divided by eligible delivered orders.
- Average delivery time: mean elapsed time from dispatch to actual delivery for delivered orders with both timestamps.
- Cancellation rate: cancelled orders divided by all placed orders in the selected view.
- Average delay: mean signed difference between actual and promised delivery among eligible delivered orders; negative values mean early delivery.
- Customer rating: mean numeric rating for delivered orders with a rating.
- Date coverage: eligible delivered orders divided by all delivered orders.

Segments with fewer than 10 eligible delivered orders are marked low-sample and should be treated as directional. Recommendations are investigation prompts, not causal conclusions. Confirm definitions, data quality, and operating context before using the results for decisions.
